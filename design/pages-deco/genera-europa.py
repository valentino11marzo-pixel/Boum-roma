#!/usr/bin/env python3
# LA COSTA D'EUROPA per la mappa dei desk (BOOM Desks, /desks, e la Rete di
# ogni pagina desk). Scritta UNA volta in cities/_europe.json, letta da
# build-cities.mjs: il build non scarica niente e regge senza il file.
#
# Fonte: Natural Earth 1:50m land (dominio pubblico, naturalearthdata.com),
# la copia GeoJSON del repository nvkelso/natural-earth-vector. La costa è
# proiettata con la STESSA mapXY delle mappe (build-cities.mjs): x = 300 +
# (lon − 5) × 17.73, y = 210 + (46.75 − lat) × 26, così ogni pallino, ogni
# arco e ogni costa stanno nelle stesse unità. Poi: ritaglio al riquadro
# (Sutherland–Hodgman: il riquadro è convesso, la terra no, e il numero di
# avvolgimento dei punti dentro resta quello giusto), semplificazione
# Douglas–Peucker a 1,2 unità, anelli sotto 10 u² tolti (Malta resta), unità
# intere. La terra si disegna a puntini ogni 5 unità: un errore di mezza
# unità non si vede, mentre i decimali e lo 0,6 dello studio pesavano 6,4 KB
# gzip sull'hub (oltre il tetto della pagina) e 16.125 caratteri (oltre i
# 16.000 del test). Così: 3,0 KB l'hub, 1,9 KB una pagina desk.
#
# Due tracciati, una fonte: `path` per la mappa dell'hub (viewBox
# 0 -40 640 520, più 5 di margine) e `desk` per la Rete delle pagine desk
# (viewBox 0 0 600 420, più 5): lo stesso disegno, ritagliato al suo
# riquadro, così una pagina desk non paga la costa che non mostra.
#
# Uso:  python3 design/pages-deco/genera-europa.py [ne_50m_land.geojson]
# Senza argomento scarica il file da GitHub (raw). Nessun percorso di una
# casa qui dentro: la radice si deriva dal file (tests/radici).
import json, math, os, sys, urllib.request
from datetime import date

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(os.path.dirname(QUI))
OUT = os.path.join(RADICE, 'cities', '_europe.json')
URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson'
SOURCE = 'Natural Earth 1:50m land (public domain)'
EPS = 1.2        # Douglas–Peucker, in map units
MIN_AREA = 10.0  # rings smaller than this (u²) are dropped
DECIMALS = 0     # whole map units: the land is a 5-unit dot matrix
BOXES = {
    # name: (xmin, ymin, xmax, ymax) — the map's viewBox, plus 5 units
    'path': (-5.0, -45.0, 645.0, 485.0),
    'desk': (-5.0, -5.0, 605.0, 425.0),
}


def map_xy(lon, lat):
    return (300 + (lon - 5) * 17.73, 210 + (46.75 - lat) * 26)


def clip(ring, box):
    """Sutherland–Hodgman against the four edges of a rectangle."""
    xmin, ymin, xmax, ymax = box
    edges = [
        (lambda p: p[0] >= xmin, lambda a, b: (xmin, a[1] + (b[1] - a[1]) * (xmin - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= xmax, lambda a, b: (xmax, a[1] + (b[1] - a[1]) * (xmax - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= ymin, lambda a, b: (a[0] + (b[0] - a[0]) * (ymin - a[1]) / (b[1] - a[1]), ymin)),
        (lambda p: p[1] <= ymax, lambda a, b: (a[0] + (b[0] - a[0]) * (ymax - a[1]) / (b[1] - a[1]), ymax)),
    ]
    out = ring
    for inside, cut in edges:
        if not out:
            break
        src, out = out, []
        prev = src[-1]
        for cur in src:
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
            prev = cur
    return out


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def dp(pts, eps):
    """Douglas–Peucker, iterative (a coast has tens of thousands of points)."""
    if len(pts) < 3:
        return pts[:]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, k = -1.0, -1
        for m in range(i + 1, j):
            d = seg_dist(pts[m], pts[i], pts[j])
            if d > best:
                best, k = d, m
        if best > eps:
            keep[k] = True
            stack.append((i, k))
            stack.append((k, j))
    return [p for p, f in zip(pts, keep) if f]


def area(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def num(v):
    s = ('%.' + str(DECIMALS) + 'f') % v
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def rings_of(geo):
    g = geo.get('geometry') or {}
    if g.get('type') == 'Polygon':
        return g['coordinates']
    if g.get('type') == 'MultiPolygon':
        return [r for poly in g['coordinates'] for r in poly]
    return []


def build(features, box):
    xmin, ymin, xmax, ymax = box
    parts, points = [], 0
    for f in features:
        for ring in rings_of(f):
            pts = [map_xy(lon, lat) for lon, lat in ring]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            if max(xs) < xmin or min(xs) > xmax or max(ys) < ymin or min(ys) > ymax:
                continue
            if pts and pts[0] == pts[-1]:
                pts = pts[:-1]
            c = clip(pts, box)
            if len(c) < 3:
                continue
            s = dp(c + [c[0]], EPS)[:-1]
            if len(s) < 3 or area(s) < MIN_AREA:
                continue
            # rounded; consecutive duplicates after rounding go
            r, last = [], None
            for x, y in s:
                q = (num(x), num(y))
                if q != last:
                    r.append(q)
                    last = q
            if len(r) < 3:
                continue
            points += len(r)
            parts.append('M' + ' '.join(a + ' ' + b for a, b in r) + 'Z')
    return ''.join(parts), points


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding='utf-8') as fh:
            data = json.load(fh)
    else:
        with urllib.request.urlopen(URL, timeout=60) as r:
            data = json.loads(r.read().decode('utf-8'))
    feats = data.get('features') or []
    out = {
        'source': SOURCE,
        'url': URL,
        'generated': date.today().isoformat(),
        'projection': 'mapXY: x = 300 + (lon - 5) * 17.73, y = 210 + (46.75 - lat) * 26',
        'simplify': {'douglasPeucker': EPS, 'minRingArea': MIN_AREA, 'decimals': DECIMALS},
        'boxes': {k: list(v) for k, v in BOXES.items()},
    }
    for name, box in BOXES.items():
        d, n = build(feats, box)
        out[name] = d
        print('%-5s %6d characters, %5d points' % (name, len(d), n))
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print('wrote', os.path.relpath(OUT, RADICE))


if __name__ == '__main__':
    main()
