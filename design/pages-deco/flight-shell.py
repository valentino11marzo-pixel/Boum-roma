"""Stable Flight asset seam for generated public pages. Does not read catalogue data."""
import re

VERSION = '20261028d'

def enhance(html, page):
    html = re.sub(r'((?:/assets/boom-flight(?:-[a-z]+)?\.(?:css|js)|/js/(?:flight|stay)-engine\.js)\?v=)[^"\s>]+',
                  lambda m: m.group(1) + VERSION, html)
    assets = [
        '<link rel="stylesheet" href="/assets/boom-flight.css?v=' + VERSION + '">',
        '<script defer src="/js/flight-engine.js?v=' + VERSION + '"></script>',
        '<script defer src="/assets/boom-flight.js?v=' + VERSION + '"></script>',
    ]
    assets += ['<script defer src="/js/stay-engine.js?v=' + VERSION + '"></script>']
    if page in ('home', 'apartments', 'detail', 'skyline'):
        assets += [
            '<link rel="stylesheet" href="/assets/boom-flight-stay.css?v=' + VERSION + '">',
            '<script defer src="/assets/boom-flight-stay.js?v=' + VERSION + '"></script>',
        ]
    if page == 'apartments':
        # Reserve the actual first view before paint. This is presentation only;
        # it never serializes a default view into the visitor's search URL.
        if 'boom-flight-apartments' not in re.search(r'<html\b[^>]*>', html).group(0):
            html = re.sub(r'<html\b([^>]*)>', lambda m:
                '<html' + (re.sub(r'class="([^"]*)"', lambda c:
                    'class="' + c.group(1) + ' boom-flight-apartments"', m.group(1))
                    if 'class="' in m.group(1) else m.group(1) +
                    ' class="boom-flight-apartments"') + '>', html, count=1)
        if 'data-flight-apartments-boot' not in html:
            html = html.replace('</head>',
                '<script data-flight-apartments-boot>try{var flightView=new URLSearchParams(location.search).get("view");document.documentElement.classList.toggle("flight-apartments-map",flightView==="skyline"||(matchMedia("(min-width:1050px)").matches&&flightView!=="grid"));}catch(_){}</script>' + '\n</head>', 1)
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
