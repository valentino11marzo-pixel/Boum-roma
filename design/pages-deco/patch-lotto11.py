#!/usr/bin/env python3
# LOTTO 11 — due debiti pagati:
#   1. via lo scalo ROM dall'hero: due segnalazioni («così a caso»), un
#      elemento che a certe larghezze non si guadagna il posto. Il flap
#      DAYS è già l'identità airport — il cartellino era decorazione.
#   2. i tasti PRECISI del blocco sul detail, come il vecchio live:
#      ◈ coordinate · ⟲ Street View · ➤ Directions, SEMPRE visibili col
#      pin, con l'onestà boom-geo (mai Street View su un centroide).
import re, shutil

def leggi(n): return open(n, encoding='utf-8').read()
def scrivi(n, s): open(n, 'w', encoding='utf-8').write(s)
def uno(s, ago, dove):
    assert s.count(ago) == 1, f'{dove}: attese 1 occorrenza, trovate {s.count(ago)} di {ago[:60]!r}'

# ── 1 · pt.html — lo scalo se ne va ──────────────────────────────────────
p = leggi('pt.html'); shutil.copy('pt.html', 'pt.html.bak11')

SCALO = '''  <div class="scalo">
    <svg class="scalo-rotta" viewBox="0 0 340 120">
      <path d="M330 8 C 240 18, 120 44, 8 108"/>
    </svg>
    <span class="scalo-punto"></span>
    <span class="scalo-tag"><span class="scalo-eco"><i></i><i></i></span><b>ROM</b><span>Rome · Italy</span></span>
  </div>
'''
uno(p, SCALO, 'pt markup scalo')
p = p.replace(SCALO, '')

ACCENDI = '@media (min-width:1280px){ .scalo { display:block; } }\n'
uno(p, ACCENDI, 'pt media scalo')
p = p.replace(ACCENDI, '')

uno(p, 'HERO — la voce · lo scalo · il tabellone', 'pt commento hero')
p = p.replace('HERO — la voce · lo scalo · il tabellone',
              'HERO — la voce · il tabellone')
scrivi('pt.html', p)

# ── 2 · costruisci-ld.py — la precisione del pin entra nella build ──────
b = leggi('costruisci-ld.py'); shutil.copy('costruisci-ld.py', 'costruisci-ld.py.bak11')

PREC_PY = '''
# port fedele di js/boom-geo.js pinPrecision — stessa regola, a build time:
# mai «exact» su un centroide, mai un civico letto dentro un CAP
STRADA = re.compile(r'\\b(via|viale|v\\.le|piazza|p\\.zza|piazzale|largo|vicolo'
                    r'|lungotevere|corso|borgo|salita|clivo|circonvallazione'
                    r'|passeggiata|ponte)\\b', re.I)
CIVICO = re.compile(r'\\b\\d{1,4}[a-zA-Z]?\\b')
def precisione(r):
    if not r.get('lat') or not r.get('lng'): return 'none'
    g = r.get('geo') or {}
    if str(g.get('src') or '').lower() == 'zone': return 'zone'
    q = str(g.get('q') or '').strip()
    if q.lower().startswith('zone:'): return 'zone'
    if q:
        if STRADA.search(q) and CIVICO.search(re.sub(r'\\broma\\b', '', q, flags=re.I)):
            return 'exact'
        return 'street' if STRADA.search(q) else 'zone'
    def dec(v):
        s = str(v); return len(s.split('.')[1]) if '.' in s else 0
    return 'zone' if max(dec(r['lat']), dec(r['lng'])) <= 4 else 'street'
'''
ANCORA = "def numero(v):\n    m = re.search(r'\\d+', str(v or ''))\n    return int(m.group()) if m else None\n"
uno(b, ANCORA, 'ld.py ancora numero')
b = b.replace(ANCORA, ANCORA + PREC_PY)

uno(b, "'fotoCurate': bool(r.get('photosEnhancedAt')),", 'ld.py fotoCurate')
b = b.replace("'fotoCurate': bool(r.get('photosEnhancedAt')),",
    "'fotoCurate': bool(r.get('photosEnhancedAt')),\n"
    "        'prec': precisione(r),")

# nel modo sito la pagina carica il boom-geo VERO per le case post-build
# (window.__LISTING): una copia sola della regola, la stessa del portal
GANCIO_SITO = "    h = h.replace('/apartments.html', '/apartments')\n"
uno(b, GANCIO_SITO, 'ld.py gancio sito')
b = b.replace(GANCIO_SITO, GANCIO_SITO +
    "    h = h.replace('</footer>',\n"
    "        '</footer>\\n<script src=\"/js/boom-geo.js\"></script>', 1)\n")
scrivi('costruisci-ld.py', b)

# ── 3 · ld-corpo.html — la riga dei tasti sotto la mappa del blocco ─────
c = leggi('ld-corpo.html'); shutil.copy('ld-corpo.html', 'ld-corpo.html.bak11')

CSS_VIC = '.vicini { margin-top:clamp(14px,1.8vw,18px); display:grid; gap:10px;'
uno(c, CSS_VIC, 'ld-corpo css vicini')
c = c.replace(CSS_VIC, '''/* i tasti del blocco — sempre visibili col pin: la mappa e un invito,
   Street View e Directions sono la porta diretta (come il vecchio live) */
.blocco-azioni { margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; }
.blocco-azioni[hidden] { display:none; }
.blkchip { display:inline-flex; align-items:center; gap:7px;
  border:1px solid var(--line); background:var(--card); border-radius:100px;
  padding:10px 15px; font-size:11.5px; color:var(--text-2);
  text-decoration:none; transition:border-color .2s ease, color .2s ease; }
a.blkchip:hover { border-color:var(--line-gold); color:var(--gold); }
.blkchip.coords { font-variant-numeric:tabular-nums; letter-spacing:.4px;
  color:var(--gold); border-color:var(--line-gold); }
.blkchip[hidden] { display:none; }
''' + CSS_VIC)

HTML_VIC = '    <div class="vicini sale" id="vicini"></div>'
uno(c, HTML_VIC, 'ld-corpo markup vicini')
c = c.replace(HTML_VIC, '''    <div class="blocco-azioni sale" id="bloccoAzioni" hidden>
      <span class="blkchip coords" id="blkCoords">◈ —</span>
      <a class="blkchip" id="blkSv" href="#" target="_blank"
        rel="noopener" hidden>⟲ Street View</a>
      <a class="blkchip" id="blkDir" href="#" target="_blank"
        rel="noopener">➤ Directions</a>
    </div>

''' + HTML_VIC)
scrivi('ld-corpo.html', c)

# ── 4 · ld-regia.html — il cablaggio dei tasti + prec nelle case runtime ─
r = leggi('ld-regia.html'); shutil.copy('ld-regia.html', 'ld-regia.html.bak11')

# 4a: casaDaListing porta geo + prec (BOOM_GEO caricato dal modo sito)
VECCHIA_COORD = '''      lat: d.lat ? parseFloat(d.lat)
        : d.geo && d.geo.lat ? parseFloat(d.geo.lat) : null,
      lng: d.lng ? parseFloat(d.lng)
        : d.geo && d.geo.lng ? parseFloat(d.geo.lng) : null,'''
uno(r, VECCHIA_COORD, 'ld-regia coord casaDaListing')
r = r.replace(VECCHIA_COORD, '''      lat: d.lat ? parseFloat(d.lat)
        : d.geo && d.geo.lat ? parseFloat(d.geo.lat) : null,
      lng: d.lng ? parseFloat(d.lng)
        : d.geo && d.geo.lng ? parseFloat(d.geo.lng) : null,
      prec: (function () {
        try { return window.BOOM_GEO
          ? BOOM_GEO.pinPrecision(d).level : null; } catch (e) { return null; }
      })(),''')

# 4b: la riga dei tasti si popola appena il posto ha un pin
GUARDIA = "    if (!c.lat || !c.lng) { sez.style.display = 'none'; return; }\n"
uno(r, GUARDIA, 'ld-regia guardia posto')
r = r.replace(GUARDIA, GUARDIA + '''
    /* i tasti diretti del blocco. Street View solo dove il pin e una
       strada vera (regola boom-geo): su un centroide di zona aprirebbe
       una via qualunque e sembrerebbe casa tua. Directions sempre:
       portano dove sappiamo portare. */
    (function () {
      var az = document.getElementById('bloccoAzioni');
      if (!az) return;
      var lvl = c.prec || (function () {
        try { return window.BOOM_GEO
          ? BOOM_GEO.pinPrecision(c).level : 'zone'; } catch (e) { return 'zone'; }
      })();
      az.hidden = false;
      var cc = document.getElementById('blkCoords');
      if (cc) cc.textContent = lvl === 'exact'
        ? '\\u25c8 ' + c.lat.toFixed(4) + '\\u00b0 N \\u00b7 ' + c.lng.toFixed(4) + '\\u00b0 E'
        : '\\u2248 ' + (lvl === 'street'
            ? 'The right street \\u2014 not the number'
            : 'Approximate position in ' + (c.zona || 'Rome'));
      var sv = document.getElementById('blkSv');
      if (sv && (lvl === 'exact' || lvl === 'street')) {
        sv.hidden = false;
        sv.textContent = lvl === 'exact'
          ? '\\u27f2 Street View \\u00b7 the exact entrance'
          : '\\u27f2 Street View \\u00b7 this street';
        sv.href = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='
          + c.lat + ',' + c.lng;
      }
      var dr = document.getElementById('blkDir');
      if (dr) dr.href = 'https://www.google.com/maps/dir/?api=1&destination='
        + c.lat + ',' + c.lng;
    })();
''')
scrivi('ld-regia.html', r)

print('lotto 11 applicato: scalo rimosso · tasti del blocco cablati')
