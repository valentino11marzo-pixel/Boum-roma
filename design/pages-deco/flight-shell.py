"""Stable Flight asset seam for generated public pages. Does not read catalogue data."""
import re

VERSION = '20261027a'

def enhance(html, page):
    assets = [
        '<link rel="stylesheet" href="/assets/boom-flight.css?v=' + VERSION + '">',
        '<script defer src="/js/flight-engine.js?v=' + VERSION + '"></script>',
        '<script defer src="/assets/boom-flight.js?v=' + VERSION + '"></script>',
    ]
    if page == 'apartments':
        assets += [
            '<link rel="stylesheet" href="/assets/boom-flight-apartments.css?v=' + VERSION + '">',
            '<script defer src="/assets/boom-flight-search.js?v=' + VERSION + '"></script>',
            '<script defer src="/assets/boom-flight-apartments.js?v=' + VERSION + '"></script>',
        ]
    additions = [s for s in assets if s not in html]
    if additions:
        html = html.replace('</head>', '\n'.join(additions) + '\n</head>', 1)
    # The listing SSR renderer anchors <body> literally. The shared JS adds its class.
    return html
