"""BOOM Flight: rearrange the existing Home, keeping its live instruments.

This is a final, idempotent presentation pass. It never builds a second
catalogue, changes a form field or replaces the Skyline engine. Both the
committed Home and a future costruisci-portale.py output use this pass.
"""
import re

VERSION = '20261028a'


def _element(source, tag, marker):
    start = source.index(marker)
    depth = 0
    for match in re.finditer(r'</?' + tag + r'\b[^>]*>', source[start:], re.I):
        depth += -1 if match.group(0).startswith('</') else 1
        if not depth:
            end = start + match.end()
            return source[start:end]
    raise ValueError('Unclosed Home element: ' + marker)


def enhance_home(source):
    if 'data-flight-home="true"' in source:
        return source
    hero = _element(source, 'header', '<header class="hero">')
    skyline = _element(source, 'section', '<section class="sezione" id="skyline">')
    form = _element(hero, 'form', '<form class="atterro" id="atterro">')
    faith = _element(hero, 'div', '<div class="hero-fede">')
    board = _element(hero, 'aside', '<aside class="board quadro"')
    board = re.sub(r'<span>Catalogue updated <b>[^<]+</b></span>', '<span>Rome · homes for living</span>', board)
    sky = _element(skyline, 'div', '<div class="cielo sale" id="cielo">')
    sky = sky.replace('class="cielo sale"', 'class="cielo"', 1)
    # An already functioning iframe hosts the one Skyline. Reserving its
    # geometry in markup avoids moving a WebGL canvas after first paint.
    scene = '''<section class="flight-home-skyline" id="skyline" aria-label="Rome Skyline">
      <div class="flight-home-skyline-heading"><div><span>SKYLINE</span><small>ROME, IN YOUR HANDS</small></div>
        <a href="/skyline" class="flight-home-expand" aria-label="Open Skyline full screen">Explore full screen <span aria-hidden="true">↗</span></a></div>
      ''' + sky + '''
      <p class="flight-home-map-note">The real city. Your places. Homes to explore.</p>
    </section>'''
    new_hero = '''<header class="hero flight-home-hero" data-flight-home="true">
  <div class="hero-velo" aria-hidden="true"><div class="hero-glow"></div><canvas id="cartaRoma"></canvas></div>
  <div class="container hero-int">
    <div class="flight-home-copy coro dentro-subito">
      <div class="hero-eyebrow"><b></b>Rome · International arrivals</div>
      <h1 class="hero-title">NEXT STOP.<span id="flapDays" class="flap-scale flight-home-word" data-word="ROME" aria-label="Rome">ROME</span><span class="flight-home-title-end">FEEL AT HOME.</span></h1>
      <p class="hero-sub">A home in Rome. A person on your side.<br>Your entire move, connected.</p>
      <div class="flight-home-actions"><a class="btn btn-primary" href="/skyline">Enter Skyline <span aria-hidden="true">↗</span></a><a class="flight-home-agency" href="#banchina">Meet your agency <span aria-hidden="true">→</span></a></div>
    </div>
    ''' + scene + '''
  </div>
  <div class="container flight-home-command">
    ''' + form + '''
    <p class="giorno-uno" id="giornoUno" hidden></p>
    <div class="flight-home-proof">''' + faith + '''<ol class="flight-home-steps" aria-label="Your move with BOOM"><li><span>01</span> Explore</li><li><span>02</span> Choose</li><li><span>03</span> Sign</li><li><span>04</span> Land</li></ol></div>
  </div>
</header>

<section class="sezione flight-home-arrivals" aria-labelledby="flightHomeArrivals">
  <div class="container flight-home-arrivals-grid">
    <div class="flight-home-board-wrap"><div class="flight-home-section-head"><div><span class="eyebrow"><i></i>The arrivals board</span><h2 class="titolo" id="flightHomeArrivals">Find your place.</h2></div><a class="btn-vai" href="/apartments">All apartments →</a></div>
      ''' + board + '''
    </div>
    <div class="flight-home-ecosystem">
      <span class="eyebrow"><i></i>One agency. The whole move.</span>
      <h2 class="titolo">From first search<br>to your first morning.</h2>
      <p>Find with us, bring a home you found, or let us handle the search. One connected path to your life in Rome.</p>
      <a class="flight-home-door" href="/property-finding"><span>I’m still searching<small>Property Finding · the wider Rome market</small></span><span aria-hidden="true">↗</span></a>
      <a class="flight-home-door" href="/deal-assistance"><span>I’ve found a home<small>A person to help with the next steps</small></span><span aria-hidden="true">↗</span></a>
      <a class="flight-home-door" href="/concierge"><span>I’m getting ready to land<small>Your arrival and everyday support</small></span><span aria-hidden="true">↗</span></a>
      <div class="flight-home-desks"><span>YOUR TENANT-SIDE DESKS</span><a href="/madrid">MADRID ↗</a><a href="/barcelona">BARCELONA ↗</a></div>
    </div>
  </div>
</section>'''
    source = source.replace(skyline, '', 1).replace(hero, new_hero, 1)
    # Reuse the real Solari board and its reduced-motion/visibility guards.
    source = source.replace("b.show('DAYS');", "b.show(host.getAttribute('data-word') || 'DAYS');", 1)
    source = source.replace("b.show('DAYS', 110, true);", "b.show(host.getAttribute('data-word') || 'DAYS', 110, true);", 1)
    css = '<link rel="stylesheet" href="/assets/boom-flight-home.css?v=' + VERSION + '">'
    js = '<script defer src="/assets/boom-flight-home.js?v=' + VERSION + '"></script>'
    if '</head>' in source:
        source = source.replace('</head>', css + '\n</head>', 1)
        source = source.replace('</body>', js + '\n</body>', 1)
    else:
        source = css + '\n' + source + '\n' + js
    return source
