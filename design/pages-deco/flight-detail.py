"""Compose the Flight dossier around the existing listing slots.

No snapshot regeneration or listing data is involved. Used by the site
builder and by the one-time migration of the published HTML template.
The legacy artefact renderer keeps its self-contained original layout.
"""
import re


def enhance(html):
    if 'class="bfd-dossier"' in html:
        return html

    def one(pattern, source, label):
        found = list(re.finditer(pattern, source, re.S))
        if len(found) != 1:
            raise ValueError('Flight detail: expected one ' + label)
        return found[0]

    hero_match = one(r'<section class="casa">.*?</section>', html, 'home hero')
    hero = hero_match.group()
    breadcrumb = one(r'<nav class="casa-briciole".*?</nav>', hero, 'breadcrumb').group()
    name = one(r'<div>\s*<h1 id="nomeCasa">.*?</div>', hero, 'listing heading').group()
    rent = one(r'<div class="canone-grande">.*?</div>', hero, 'rent board').group()
    status = one(r'<span class="stato-grande" id="statoCasa">.*?</span>', hero, 'status').group()
    heart = one(r'<button[^>]*id="cuoreCasa".*?</button>', hero, 'saved home').group()
    scene_start = hero.index('<div class="scena-casa">')
    scene_end = hero.rindex('  </div>')
    scene = hero[scene_start:scene_end]
    scene = scene.replace(name, '').replace(rent, '')
    scene = re.sub(r'<div class="telaio-alto">.*?</div>', '', scene, count=1, flags=re.S)
    scene = re.sub(r'<div class="telaio-basso">\s*</div>',
        '<div class="telaio-basso"><button type="button" class="bfd-open-photos" '
        'data-bfd-photos>View all photos <span aria-hidden="true">↗</span></button></div>',
        scene, count=1)

    place_match = one(r'<section class="sezione" id="posto">.*?</section>', html, 'place panel')
    place = place_match.group().replace('<section class="sezione" id="posto">',
        '<section class="sezione" id="posto" role="tabpanel" '
        'aria-labelledby="bfd-everyday-tab" tabindex="0" hidden>', 1)
    place = re.sub(r"The real map and the real distances, measured from\s+this door — not from the zone's name\.", 'Explore the area and compare journeys. Map precision and travel estimates are shown below.', place)
    place = re.sub(r'<h2 class="titolo">See the <span class="hl">block</span> — before you\s*cross town.</h2>',
        '<h2 class="titolo">Your everyday. <span class="hl">Around here.</span></h2>', place, count=1)

    cost_start = html.index('      <div class="chiavi-cima">')
    cost_end = html.index('      <div class="chiavi-compra">', cost_start)
    costs = html[cost_start:cost_end]
    costs = costs.replace('Due on day one — all of it, in writing', 'Day one · rent + fee + deposit')
    costs = costs.replace("Agency fee — 10% of a year's rent + 22% VAT, once",
        "Agency fee · incl. VAT, once<em>10% of a year's rent + 22% VAT</em>")

    dossier = '''<section class="casa">
  <div class="container">
    BREADCRUMB
    <div class="bfd-heading">
      <div><span class="bfd-kicker">Rome / your next chapter</span>NAME</div>
      <div class="bfd-save"><span id="bfd-save-label">Save home</span>HEART</div>
    </div>
    <div class="bfd-dossier">
      <div class="bfd-main">
        <div class="bfd-tabs" role="tablist" aria-label="Explore this home">
          <button type="button" id="bfd-home-tab" role="tab" aria-controls="bfd-home-panel" aria-selected="true">The home</button>
          <button type="button" id="bfd-everyday-tab" role="tab" aria-controls="posto" aria-selected="false" tabindex="-1">Your everyday <span aria-hidden="true">↗</span></button>
        </div>
        <div id="bfd-home-panel" role="tabpanel" aria-labelledby="bfd-home-tab" tabindex="0">
          SCENE
        </div>
        PLACE
      </div>
      <aside class="bfd-pass" aria-label="Your landing plan">
        <div class="bfd-pass-code"><span>BOOM / FLIGHT</span><span>ROM</span></div>
        <h2 class="bfd-pass-title">Your landing plan.</h2>
        STATUS
        RENT
        <div class="bfd-pass-actions">
          <a class="bfd-apply" href="#applica" data-bfd-apply>See next steps</a>
          <a class="bfd-hold" href="#presaCasa" data-bfd-hold hidden>See hold options</a>
        </div>
        <div class="bfd-perforation" aria-hidden="true"></div>
        COSTS
        <a class="bfd-money-link" href="#denaro">Costs and what’s included ↗</a>
        <p class="flight-stay-note" data-stay-note="detail" hidden></p>
        <p class="bfd-pass-note">Final terms in writing, before you pay.</p>
        <a class="bfd-person" href="#chiedi" data-bfd-contact target="_blank" rel="noopener">
          <span><b>A person, with you.</b><small>Ask BOOM about this home</small></span><span aria-hidden="true">↗</span>
        </a>
        <a class="bfd-viewing" href="#porticine" data-bfd-viewing target="_blank" rel="noopener" hidden>See this home live ↗</a>
      </aside>
    </div>
  </div>
</section>'''
    for key, value in [('BREADCRUMB', breadcrumb), ('NAME', name), ('HEART', heart),
                       ('SCENE', scene), ('PLACE', place), ('STATUS', status),
                       ('RENT', rent), ('COSTS', costs)]:
        dossier = dossier.replace(key, value)
    html = html.replace(place_match.group(), '', 1)
    # Move the actual cost slots, not a computed copy of their amounts.
    html = html[:html.index('      <div class="chiavi-cima">')] + \
        html[html.index('      <div class="chiavi-compra">'):]
    html = html.replace(hero, dossier, 1)
    html = html.replace('<html lang="en">', '<html lang="en" class="boom-flight-detail">', 1)
    if 'class="boom-flight-detail"' not in html:
        html = html.replace('<html ', '<html class="boom-flight-detail" ', 1)
    # Dress the existing map once its own 3D layer exists. Geometry, sources,
    # camera, location precision and all routing remain with the original engine.
    map_anchor = '        /* gli anelli del passo: 5/10/15 minuti a 4.8 km/h */'
    if html.count(map_anchor) != 1:
        raise ValueError('Flight detail: expected one map style hook')
    html = html.replace(map_anchor,
        "        if (window.BOOM_FLIGHT_MAP) BOOM_FLIGHT_MAP.dress(mappaB, 'blocco-3d');\n"
        + map_anchor, 1)
    html = html.replace('</head>',
        '<link rel="stylesheet" href="/assets/boom-flight-detail.css?v=20261028e">\n'
        '<noscript><style>.boom-flight-detail #posto[hidden]{display:block!important;'
        'margin-top:28px}.boom-flight-detail .bfd-tabs,.boom-flight-detail '
        '.bfd-open-photos{display:none}</style></noscript>\n</head>', 1)
    html = html.replace('</body>',
        '<script defer src="/js/flight-map.js?v=20261027a"></script>\n'
        '<script defer src="/assets/boom-flight-detail.js?v=20261028e"></script>\n</body>', 1)
    return '\n'.join(line.rstrip() for line in html.split('\n'))
