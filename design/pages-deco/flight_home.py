"""BOOM Flight: rearrange the existing Home, keeping its live instruments.

This is a final, idempotent presentation pass. It never builds a second
catalogue or replaces the Skyline engine. Stay is a requested preference. Both the
committed Home and a future costruisci-portale.py output use this pass.
"""
import re

VERSION = '20261028g'


def _element(source, tag, marker):
    start = source.index(marker)
    depth = 0
    for match in re.finditer(r'</?' + tag + r'\b[^>]*>', source[start:], re.I):
        depth += -1 if match.group(0).startswith('</') else 1
        if not depth:
            end = start + match.end()
            return source[start:end]
    raise ValueError('Unclosed Home element: ' + marker)



def _stay_intent(source):
    field = '<div class="atterro-campo ac-stay flight-stay-fields">\n          <span>Your stay</span>\n          <div class="flight-stay-dates">\n            <label>From<input type="date" id="stayMoveIn" aria-describedby="stayDatesError"></label>\n            <label>Until<input type="date" id="stayMoveOut" aria-describedby="stayDatesError"></label>\n          </div>\n          <div class="flight-stay-shortcut">\n            <select id="durataSoggiorno" aria-label="Stay length shortcut"><option value="">Choose dates</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="18">18 months</option><option value="24">24 months</option></select>\n            <button type="button" data-stay-clear>Clear dates</button>\n          </div>\n          <output data-stay-summary aria-live="polite"></output>\n          <p id="stayDatesError" role="alert" hidden></p>\n        </div>'
    source = re.sub('<div class="atterro-campo ac-data">\\s*<span id="quandoEti">.*?</div>', lambda _: field, source, count=1, flags=re.S)
    source = re.sub(r'<label class="atterro-campo ac-stay">.*?</label>', lambda _: field, source, count=1, flags=re.S)
    source = source.replace('<form class="atterro" id="atterro">', '<form class="atterro" id="atterro" data-stay-page="home">', 1)
    source = re.sub('/\\* «when do you land\\?» — il campo data NATIVO.*?\\n  \\}\\)\\(\\);', '/* Stay intent is carried by boom-flight-stay.js; no snapshot match count. */', source, count=1, flags=re.S)
    if 'id="stayPreferenceNote"' not in source:
        start = source.index('<form class="atterro"')
        end = source.index('</form>', start) + len('</form>')
        source = source[:end] + '\n    <p class="flight-stay-note" id="stayPreferenceNote" data-stay-note="home" hidden></p>' + source[end:]
    return source


def _editorial(source):
    """One decision per section; retain the actual instruments and service terms."""
    if 'data-flight-editorial="2"' in source:
        return source
    if 'class="flight-home-ecosystem"' not in source:
        return source
    old = _element(source, 'div', '<div class="flight-home-ecosystem">')
    source = source.replace(old, '''<div class="flight-home-ecosystem flight-home-your-rome" data-flight-editorial="2">
      <span class="eyebrow"><i></i>Your Rome · by Skyline</span>
      <h2 class="titolo">Your campus.<br>Your budget. <span class="hl">Your balance.</span></h2>
      <p>The centre is one possibility. Start with where you need to be, then compare the rent, space and journey that work for you.</p>
      <div class="flight-route-signal" aria-hidden="true"><span>HOME</span><i><b></b></i><span>YOUR EVERYDAY</span></div>
      <a class="flight-balance-cta" href="/skyline?guide=1">Find my balance <span aria-hidden="true">↗</span></a>
      <a class="flight-balance-about" href="/your-rome">Explore campuses &amp; how it works →</a>
      <p class="flight-balance-foot">Free to explore · share your search · no account needed</p>
    </div>''', 1)
    source = source.replace('Meet your agency <span', 'Meet your agency <span', 1)
    source = source.replace('href="#banchina">Meet your agency', 'href="#perche">Meet your agency', 1)
    source = source.replace('<span>Apply · 2 min</span>', '<span>Apply &amp; review</span>', 1)
    source = source.replace('<span>Move in · 48h</span>', '<span>Get your keys</span>', 1)
    source = source.replace('boomrome.com — live product', 'The BOOM journey · illustrative preview', 1)
    source = source.replace('Real human · 1h 47m later', 'Your BOOM contact · after review', 1)
    source = source.replace('Move-in confirmed · 48h', 'Your next chapter', 1)
    services = _element(source, 'section', '<section class="sezione flight-home-services"')
    revised = services.replace('<div class="sale">', '<div class="sale flight-service-heading">', 1)
    revised = re.sub(r'<p class="sotto">Every price is flat.*?</p>', '''<p class="sotto">A dedicated search, or a hand with a home you found. Choose the support you need, with the scope and fee clear from the start. <a class="sotto-vai" href="/your-money">See how your money moves →</a></p>''', revised, count=1, flags=re.S)
    revised = re.sub(r'<svg class="timbro".*?</svg>', '''<span class="flight-ground-mark"><i aria-hidden="true"><b></b><b></b><b></b></i><span>BOOM / ON THE GROUND<small>In-person viewings in Rome</small></span></span>''', revised, count=1, flags=re.S)
    revised = re.sub(r'<span class="promessa">Your private hunter.*?</span>', '''<span class="promessa">A dedicated search across the Rome market, based on <b>your written criteria</b>. We organise viewings and help you choose.</span>''', revised, count=1, flags=re.S)
    revised = re.sub(r'<span class="dettagli">.*?</span>\s*</span>\s*<span class="perf perf-v">', '''<span class="dettagli"><span><em>Search brief</em><strong>Your criteria</strong></span><span><em>Options</em><strong>At least 3 in 15 days</strong></span><span><em>On success</em><strong>Credited to agency fee</strong></span></span></span><span class="perf perf-v">''', revised, count=1, flags=re.S)
    revised = re.sub(r'<span class="rassicura"><span><b>Zero risk:</b>.*?</span></span>', '''<span class="rassicura"><span>€350 refunded if we do not present at least 3 matching options within 15 days. Terms §4.2.</span></span>''', revised, count=1, flags=re.S)
    # PFS and DAS are the two main decisions. DOM and visual order agree.
    pf = _element(revised, 'a', '<a class="bp eroe"')
    vv = _element(revised, 'a', '<a class="bp vv"')
    da = _element(revised, 'a', '<a class="bp da"')
    cc = _element(revised, 'a', '<a class="bp cc"')
    revised = revised.replace(pf, pf.replace('bp eroe', 'bp eroe flight-ticket-main'), 1)
    revised = revised.replace(vv, da.replace('bp da', 'bp da flight-ticket-main'), 1)
    # The original DAS block remains after the replaced VV block.
    revised = revised.replace(da, vv.replace('bp vv', 'bp vv flight-ticket-small'), 1)
    revised = revised.replace(cc, cc.replace('bp cc', 'bp cc flight-ticket-small'), 1)
    revised = revised.replace('Refunded or credited if we don\'t deliver', 'Service scope and terms shown before checkout')
    revised = revised.replace('aria-label="Guarantees"', 'aria-label="Your safeguards"')
    revised = re.sub(r'<div class="ba-cifre">.*?</div>\s*</div>', '', revised, count=1, flags=re.S)
    source = source.replace(services, revised, 1)
    # A compact concierge menu follows the tangible tenant-pass experience.
    concierge_marker = '<section class="sezione">\n  <div class="container">\n    <div class="testa-fila sale">'
    if concierge_marker in source:
        concierge = _element(source, 'section', concierge_marker)
        tenant = _element(source, 'section', '<section class="sezione">\n  <div class="container pass-fila">')
        tenant = tenant.replace('class="sezione"', 'class="sezione flight-home-aftercare"', 1)
        tenant = tenant.replace("Most agencies disappear at the keys. That's where\n        we clock in: your pass, your rent, your receipts and a named person\n        — in your pocket for the whole stay.", 'Your contract, receipts and support stay connected throughout your tenancy. A real person behind the interface.')
        source = source.replace(_element(source, 'section', '<section class="sezione">\n  <div class="container pass-fila">'), '', 1)
        concierge_new = concierge.replace('class="sezione"', 'class="sezione flight-home-concierge"', 1)
        source = source.replace(concierge, tenant + '\n' + concierge_new, 1)
    start = source.index('    <p class="dolori-capo">')
    end = source.index('    <div class="chi-num', start)
    substance = source[start:end]
    source = source[:start] + '''    <div class="flight-home-difference">
      <button type="button" class="flight-disclosure" data-flight-disclosure="flightDifference" aria-expanded="true" aria-controls="flightDifference" hidden>What changes when you rent with BOOM <span aria-hidden="true">+</span></button>
      <div id="flightDifference">''' + substance + '</div></div>\n' + source[end:]
    source = source.replace('class="sezione fond-sezione"', 'class="sezione fond-sezione flight-home-founder"', 1)
    source = source.replace('<section class="sezione">\n  <div class="container org-fila">', '<section class="sezione flight-home-organisations">\n  <div class="container org-fila">', 1)
    source = source.replace('Stop fighting the system. Let us handle it.', 'Start with a home, a campus or a conversation.', 1)
    return re.sub(r'(?m)^[ \t]+$', '', source)


def _fluid_home(source):
    """Keep the live objects; compose the first decision before the map on phones."""
    if '<span class="flight-ground-mark">' in source:
        badge = _element(source, 'span', '<span class="flight-ground-mark">')
        ticket = _element(source, 'a', '<a class="bp eroe flight-ticket-main"')
        body = _element(ticket, 'span', '<span class="corpo">')
        if badge not in body:
            source = source.replace(ticket, ticket.replace(badge, '', 1).replace(body, body[:-7] + badge + '</span>', 1), 1)
    if 'data-flight-composition="4"' in source:
        return re.sub(r'(?m)^[ \t]+$', '', source)
    hero = _element(source, 'header', '<header class="hero flight-home-hero"')
    copy = _element(hero, 'div', '<div class="flight-home-copy')
    copy = re.sub(r'\s*<div class="flight-home-actions">.*?</div>', '', copy, count=1, flags=re.S)
    scene = _element(hero, 'section', '<section class="flight-home-skyline"')
    scene = scene.replace('ROME, IN YOUR HANDS', 'YOUR CITY. YOUR EVERYDAY.').replace('Explore full screen <span', 'Explore Skyline <span')
    scene = scene.replace('<p class="flight-home-map-note">The real city. Your places. Homes to explore.</p>', '<a class="flight-home-map-invite" href="/skyline?guide=1"><span><small>YOUR ROME</small>Find the balance that fits your life.</span><b>Find my balance <i aria-hidden="true">↗</i></b></a>')
    command = _element(hero, 'div', '<div class="container flight-home-command">')
    proof = _element(command, 'div', '<div class="flight-home-proof">')
    command = command.replace(proof, '').replace('class="container flight-home-command"', 'class="flight-home-command"')
    shortcut = _element(command, 'div', '<div class="flight-stay-shortcut">')
    command = command.replace(shortcut, '<details class="flight-stay-options"><summary>Choose by length <span aria-hidden="true">+</span></summary>' + shortcut + '</details>')
    command = command.replace('<span>Your stay</span>', '<span>Your landing plan</span>', 1).replace('<option value="">—</option>', '<option value="">Choose</option>', 1)
    proof = re.sub(r'<ol class="flight-home-steps".*?</ol>', '<a class="flight-home-agency" href="#perche">Meet your agency <span aria-hidden="true">↗</span></a>', proof, count=1, flags=re.S)
    new = '<header class="hero flight-home-hero" data-flight-home="true" data-flight-composition="4">\n  <div class="hero-velo" aria-hidden="true"><div class="hero-glow"></div><canvas id="cartaRoma"></canvas></div>\n  <div class="container hero-int">\n' + copy + '\n' + command + '\n' + scene + '\n' + proof + '\n  </div>\n</header>'
    source = source.replace(hero, new, 1)
    # The photo collection earns first position. The original arrivals board
    # remains visible and functional, without preceding the actual homes twice.
    arrivals = _element(source, 'section', '<section class="sezione flight-home-arrivals"')
    discovery = _element(source, 'section', '<section class="sezione flight-home-discovery"')
    app = _element(discovery, 'div', '<div class="apparecchio quadro sale"')
    stories = [
        ('Start with your everyday.', 'Explore real homes, then weigh the space, rent and route to the places that matter to you.', '/skyline?guide=1', 'Find my balance'),
        ('A real person reviews your move.', 'Tell us who is moving and your exact dates. Review everything before you send. Applying is free; no payment is taken.', '/apartments', 'Choose your home'),
        ('Know what you are signing.', 'Review the agreed lease and the move-in breakdown before signing or paying. Keep the next steps together.', '/your-money', 'How your money moves'),
        ('Land. Settle. Stay connected.', 'Arrange your arrival with BOOM. Your tenant area keeps the contract, receipts and support close throughout your stay.', '/concierge', 'Explore arrival support')
    ]
    for i, (title, body, href, cta) in enumerate(stories):
        panel = _element(app, 'div', '<div class="scena-p' + (' attiva' if i == 0 else '') + '" data-s="' + str(i) + '"')
        opening = panel[:panel.index('>') + 1]
        revised = opening + '<div class="flight-journey-visual" aria-hidden="true">' + panel[len(opening):-6] + '</div><div class="flight-journey-story"><span class="flight-journey-number">0' + str(i + 1) + ' / YOUR MOVE</span><h3>' + title + '</h3><p>' + body + '</p><a href="' + href + '">' + cta + ' <span aria-hidden="true">↗</span></a></div></div>'
        app = app.replace(panel, revised, 1)
    app = app.replace('class="app-vetro" aria-hidden="true"', 'class="app-vetro"').replace('<span>The BOOM journey · illustrative preview</span>', '<span>How it works · illustrative preview</span><button type="button" data-journey-play aria-pressed="false">Play journey <span aria-hidden="true">▷</span></button>')
    journey = '<section class="sezione flight-home-journey" aria-labelledby="flightJourneyTitle"><div class="container"><div class="flight-home-section-head"><div><span class="eyebrow"><i></i>From first look to first morning</span><h2 class="titolo" id="flightJourneyTitle">One move. <span class="hl">Four clear steps.</span></h2></div></div>' + app + '</div></section>'
    discovery = discovery.replace(_element(discovery, 'div', '<div class="apparecchio quadro sale"'), '')
    discovery = discovery.replace('<div class="settimana coro">', '<div class="settimana coro" id="flightHomeRail" aria-label="Available homes">', 1)
    discovery = discovery.replace('\n    </div>\n\n    \n', '\n      <div class="flight-rail-controls" hidden><span data-rail-position aria-live="polite">01 / 03</span><div><button type="button" data-rail-prev aria-label="Previous home" aria-controls="flightHomeRail">←</button><button type="button" data-rail-next aria-label="Next home" aria-controls="flightHomeRail">→</button></div></div>\n    </div>\n', 1)
    source = source.replace(arrivals, '', 1).replace(_element(source, 'section', '<section class="sezione flight-home-discovery"'), discovery + '\n' + arrivals + '\n' + journey, 1)
    source = source.replace('Pick the door that matches\n        <span class="hl">your situation</span>.', 'Your move.\n        <span class="hl">Your level of support.</span>', 1)
    # One controller owns the journey; no second autoplay clock.
    source = re.sub(r"  /\* L'APPARECCHIO:.*?(?=  /\* il pass:)", '  /* The accessible Flight journey is controlled by boom-flight-home.js. */\n\n', source, count=1, flags=re.S)
    source = source.replace("fr.src = '/skyline?embed=1';", "fr.src = '/skyline?embed=1&preview=1';", 1).replace("{ rootMargin: '260px 0px' }).observe(telaio)", "{ rootMargin: '80px 0px' }).observe(telaio)", 1)
    return re.sub(r'(?m)^[ \t]+$', '', source)


def enhance_home(source):
    source = _stay_intent(source)
    source = source.replace('<section class="sezione">\n  <div class="container doppia">', '<section class="sezione flight-home-discovery">\n  <div class="container doppia">', 1)
    source = source.replace('<section class="sezione" id="banchina">', '<section class="sezione flight-home-services" id="banchina">', 1)
    if 'data-flight-home="true"' in source:
        return _fluid_home(_editorial(source))
    hero = _element(source, 'header', '<header class="hero">')
    skyline = _element(source, 'section', '<section class="sezione" id="skyline">')
    form = _element(hero, 'form', '<form class="atterro" id="atterro" data-stay-page="home">') + '\n    <p class="flight-stay-note" id="stayPreferenceNote" data-stay-note="home" hidden></p>'
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
    return _fluid_home(_editorial(source))
