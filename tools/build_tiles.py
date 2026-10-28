"""Build the streamed world around Surfers Paradise: 1 km tiles from Southport to Burleigh Heads,
inland to Robina, Carrara and Benowa.

Inputs: data/region/osm_*.json (OpenStreetMap via Overpass), data/region/ms_buildings.json (Microsoft footprints),
        data/map.json (the hand-detailed Surfers Paradise core, which tiles leave alone).
Outputs: dist/tiles/t_<i>_<j>.json (one per non-empty tile), dist/tiles/region.json (overview for maps and the index).
Run: python3 tools/build_tiles.py
"""
import glob, json, math, os, random, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE = 1000.0
LAT0, LON0 = (-28.013 + -27.986) / 2, (153.411 + 153.436) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
def proj(lat, lon): return (round((lon - LON0) * KX, 1), round((LAT0 - lat) * KZ, 1))
RS, RW, RN, RE = -28.110, 153.355, -27.935, 153.468
RX0, RZ0 = proj(RN, RW)
RX1, RZ1 = proj(RS, RE)
CORE = json.load(open(os.path.join(ROOT, 'data', 'map.json')))['bounds']  # [minx, minz, maxx, maxz]
def in_core(x, z, pad=0): return CORE[0] - pad <= x <= CORE[2] + pad and CORE[1] - pad <= z <= CORE[3] + pad
def tkey(x, z): return (int(math.floor(x / TILE)), int(math.floor(z / TILE)))

# ---------------------------------------------------------------- load OSM blocks (deduplicated)
els = {}
for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'region', 'osm_*.json'))):
    for e in json.load(open(path))['elements']:
        els[(e['type'], e['id'])] = e
els = list(els.values())
print('osm elements', len(els))
def geom(e): return [proj(g['lat'], g['lon']) for g in e.get('geometry', []) if g]
def epos(e):
    if e['type'] == 'node': return proj(e['lat'], e['lon'])
    g = geom(e)
    if g: return (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g))
    if e.get('members'):
        pts = [p for m in e['members'] for p in [proj(q['lat'], q['lon']) for q in m.get('geometry', []) if q]]
        if pts: return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    return None
def flat(pts):
    out = []
    for x, z in pts: out += [round(x, 1), round(z, 1)]
    return out
def area(pts):
    a = 0
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]; a += x1 * z2 - x2 * z1
    return a / 2
def simplify(pts, tol):
    if len(pts) < 3: return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        ax, az = out[-1]; bx, bz = pts[i]; cx, cz = pts[i + 1]
        dx, dz = cx - ax, cz - az; L = math.hypot(dx, dz) or 1
        if abs((bx - ax) * dz - (bz - az) * dx) / L > tol or math.hypot(bx - ax, bz - az) > 80: out.append(pts[i])
    out.append(pts[-1]); return out
def ring_clean(p): return p[:-1] if len(p) > 1 and p[0] == p[-1] else p
def join_rings(ways):
    ways = [list(w) for w in ways if len(w) > 1]; rings = []
    while ways:
        cur = ways.pop(0); changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]: cur += w[1:]
                elif w[-1] == cur[-1]: cur += w[::-1][1:]
                elif w[-1] == cur[0]: cur = w + cur[1:]
                elif w[0] == cur[0]: cur = w[::-1] + cur[1:]
                else: continue
                ways.pop(i); changed = True; break
        rings.append(ring_clean(cur))
    return rings
def pip(pt, poly):
    x, z = pt; c = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi: c = not c
        j = i
    return c

# ---------------------------------------------------------------- clipping helpers
def clip_polygon(pts, x0, z0, x1, z1):
    """Sutherland-Hodgman against an axis-aligned rectangle"""
    def clip(poly, inside, inter):
        out = []
        for i in range(len(poly)):
            cur, prev = poly[i], poly[i - 1]
            if inside(cur):
                if not inside(prev): out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev): out.append(inter(prev, cur))
        return out
    def ix(a, b, x): t = (x - a[0]) / ((b[0] - a[0]) or 1e-9); return (x, a[1] + (b[1] - a[1]) * t)
    def iz(a, b, z): t = (z - a[1]) / ((b[1] - a[1]) or 1e-9); return (a[0] + (b[0] - a[0]) * t, z)
    p = pts
    for inside, inter in ((lambda q: q[0] >= x0, lambda a, b: ix(a, b, x0)), (lambda q: q[0] <= x1, lambda a, b: ix(a, b, x1)),
                          (lambda q: q[1] >= z0, lambda a, b: iz(a, b, z0)), (lambda q: q[1] <= z1, lambda a, b: iz(a, b, z1))):
        if not p: break
        p = clip(p, inside, inter)
    return p
def clip_polyline(pts, x0, z0, x1, z1):
    """pieces of a polyline inside a rectangle (Liang-Barsky per segment)"""
    pieces, cur = [], []
    for i in range(len(pts) - 1):
        (ax, az), (bx, bz) = pts[i], pts[i + 1]
        dx, dz = bx - ax, bz - az; t0, t1 = 0.0, 1.0; ok = True
        for p, q in ((-dx, ax - x0), (dx, x1 - ax), (-dz, az - z0), (dz, z1 - az)):
            if p == 0:
                if q < 0: ok = False; break
            else:
                r = q / p
                if p < 0: t0 = max(t0, r)
                else: t1 = min(t1, r)
        if not ok or t0 > t1:
            if len(cur) > 1: pieces.append(cur)
            cur = []; continue
        a = (ax + dx * t0, az + dz * t0); b = (ax + dx * t1, az + dz * t1)
        if not cur or math.hypot(cur[-1][0] - a[0], cur[-1][1] - a[1]) > 0.01:
            if len(cur) > 1: pieces.append(cur)
            cur = [a]
        cur.append(b)
        if t1 < 1:
            pieces.append(cur); cur = []
    if len(cur) > 1: pieces.append(cur)
    return pieces

# ---------------------------------------------------------------- the ocean, from the coastline (land on the left of each way)
def water_from_coast(lines, x0, z0, x1, z1):
    """closed water polygons inside a rectangle from coastline polylines oriented land-left"""
    W, H = x1 - x0, z1 - z0
    def per(p):  # position around the rectangle: top edge (z0) left->right, right edge, bottom right->left, left edge
        x, z = p
        if abs(z - z0) < 1e-6: return x - x0
        if abs(x - x1) < 1e-6: return W + (z - z0)
        if abs(z - z1) < 1e-6: return W + H + (x1 - x)
        return 2 * W + H + (z1 - z)
    def pt_at(s):
        s %= 2 * (W + H)
        if s < W: return (x0 + s, z0)
        if s < W + H: return (x1, z0 + s - W)
        if s < 2 * W + H: return (x1 - (s - W - H), z1)
        return (x0, z1 - (s - 2 * W - H))
    corners = [0, W, W + H, 2 * W + H]
    pieces, rings = [], []
    for ln in lines:
        if ln[0] == ln[-1] and all(x0 < p[0] < x1 and z0 < p[1] < z1 for p in ln):
            rings.append(ln); continue
        for pc in clip_polyline(ln, x0, z0, x1, z1):
            if len(pc) > 1: pieces.append(pc)
    # pieces must start and end on the boundary to be stitched
    pieces = [p for p in pieces if min(abs(p[0][0] - x0), abs(p[0][0] - x1), abs(p[0][1] - z0), abs(p[0][1] - z1)) < 0.5
              and min(abs(p[-1][0] - x0), abs(p[-1][0] - x1), abs(p[-1][1] - z0), abs(p[-1][1] - z1)) < 0.5]
    def snap(p):
        x, z = p; d = [abs(x - x0), abs(x - x1), abs(z - z0), abs(z - z1)]; k = d.index(min(d))
        return [(x0, z), (x1, z), (x, z0), (x, z1)][k]
    for p in pieces: p[0] = snap(p[0]); p[-1] = snap(p[-1])
    # which way round the rectangle keeps the water on the right? test with the first piece's exit
    if pieces:
        p = pieces[0]; (ax, az), (bx, bz) = p[-2], p[-1]
        rx, rz = -(bz - az), (bx - ax)  # right of travel (x right, z down)
        s = per(p[-1]); qa, qb = pt_at(s + 1), pt_at(s - 1)
        forward = ((qa[0] - bx) * rx + (qa[1] - bz) * rz) >= ((qb[0] - bx) * rx + (qb[1] - bz) * rz)
    polys, used = [], [False] * len(pieces)
    for k in range(len(pieces)):
        if used[k]: continue
        poly, cur = [], k
        for _ in range(len(pieces) + 5):
            used[cur] = True; poly += pieces[cur]
            s = per(pieces[cur][-1])
            best, bd = None, 1e18  # next entry point walking the chosen way round
            for j, q in enumerate(pieces):
                if used[j] and j != k: continue
                d = (per(q[0]) - s) % (2 * (W + H)) if forward else (s - per(q[0])) % (2 * (W + H))
                if d < bd: bd, best = d, j
            for c in sorted(corners, key=lambda c: ((c - s) % (2 * (W + H))) if forward else ((s - c) % (2 * (W + H)))):
                d = (c - s) % (2 * (W + H)) if forward else (s - c) % (2 * (W + H))
                if 0 < d < bd: poly.append(pt_at(c))
            if best == k or best is None: break
            cur = best
        if len(poly) > 2: polys.append(poly)
    return polys, rings

coast_ways = [geom(e) for e in els if e['type'] == 'way' and e.get('tags', {}).get('natural') == 'coastline']
def join_lines(ways):
    """join coastline ways end-to-start (they all run land-left, so no reversing); closed results keep their closing point"""
    ways = [list(w) for w in ways if len(w) > 1]; out = []
    while ways:
        cur = ways.pop(0); grew = True
        while grew and cur[0] != cur[-1]:
            grew = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]: cur += w[1:]; ways.pop(i); grew = True; break
                if w[-1] == cur[0]: cur = w + cur[1:]; ways.pop(i); grew = True; break
        out.append(cur)
    return out
coast = join_lines(coast_ways)
ocean_polys, ocean_rings = water_from_coast(coast, RX0, RZ0, RX1, RZ1)
# sanity check: a point well out to sea must be water, the middle of Surfers must not
def in_water_rings(pt):
    c = False
    for poly in ocean_polys + ocean_rings:
        if pip(pt, poly): c = not c
    return c
sea, land = proj(-28.0, 153.466), proj(-28.0, 153.425)
if not in_water_rings(sea) and in_water_rings(land):
    ocean_polys = [p[::-1] for p in ocean_polys]
    raise SystemExit('coastline orientation check failed — inspect the stitching')
print('coastline pieces', len(coast), 'ocean polygons', len(ocean_polys), 'island rings', len(ocean_rings), 'sea test', in_water_rings(sea), 'land test', in_water_rings(land))

# ---------------------------------------------------------------- roads
ROAD_TYPES = ['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'pedestrian', 'footway', 'cycleway', 'path', 'steps',
              'unclassified', 'living_street', 'track', 'motorway']
LINK = {'trunk_link': 'trunk', 'primary_link': 'primary', 'secondary_link': 'secondary', 'tertiary_link': 'tertiary', 'motorway_link': 'motorway'}
DRIVABLE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street'}
DEFAULT_W = {'motorway': 22, 'trunk': 13, 'primary': 10, 'secondary': 9, 'tertiary': 8, 'residential': 6.5, 'unclassified': 6.5, 'living_street': 5.5,
             'service': 4.2, 'pedestrian': 7, 'footway': 2.2, 'cycleway': 2.5, 'path': 2, 'steps': 2.2, 'track': 3}
tiles = {}
def T(k):
    if k not in tiles:
        tiles[k] = dict(names=[], roads=[], buildings=[], areas={}, water=[], pois=[], fuel=[], trees=[], lamps=[], edges=[], nodes={}, signals=[], bnames={})
    return tiles[k]
def name_idx(t, n):
    if not n: return -1
    if n not in t['names']: t['names'].append(n)
    return t['names'].index(n)
graph_ways = []
road_segs = []  # for tree placement: (ax, az, bx, bz, w)
for e in els:
    t = e.get('tags', {}); hw = t.get('highway')
    if e['type'] != 'way' or not hw: continue
    is_link = hw in LINK; hw = LINK.get(hw, hw)
    if hw not in ROAD_TYPES or t.get('area') == 'yes': continue
    oneway = t.get('oneway') == 'yes' or t.get('junction') == 'roundabout' or (hw == 'motorway' and t.get('oneway') != 'no')
    try: lanes = int(t.get('lanes', '').split(';')[0]) if t.get('lanes') else None
    except ValueError: lanes = None
    width = lanes * 3.4 + (0.8 if hw in ('motorway', 'trunk', 'primary') else 0) if lanes else DEFAULT_W[hw]
    if not lanes:
        if oneway and hw in ('motorway', 'trunk', 'primary', 'secondary'): width *= 0.55
        if is_link: width = 4.8
        lanes = 2 if not oneway else (2 if width > 7 else 1)
    pts = geom(e)
    if len(pts) < 2: continue
    bridge = 1 if t.get('bridge') == 'yes' else 0
    for i in range(len(pts) - 1):
        road_segs.append((pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width))
    # cut into tiles, leaving the Surfers core alone
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    for ti in range(tkey(min(xs), 0)[0], tkey(max(xs), 0)[0] + 1):
        for tj in range(tkey(0, min(zs))[1], tkey(0, max(zs))[1] + 1):
            x0, z0 = ti * TILE, tj * TILE
            for pc in clip_polyline(pts, x0, z0, x0 + TILE, z0 + TILE):
                # drop the parts inside the core (it has its own roads)
                if all(in_core(q[0], q[1], -1) for q in pc): continue
                tt = T((ti, tj))
                tt['roads'].append([ROAD_TYPES.index(hw), round(width, 1), name_idx(tt, t.get('name')), bridge] + flat(simplify(pc, 0.3)))
    if hw in DRIVABLE or is_link:
        graph_ways.append(dict(pts=pts, ids=e['nodes'], oneway=oneway, lanes=lanes, width=width, name=t.get('name'), type=ROAD_TYPES.index(hw)))

# drivable graph: edges between junctions, owned by the tile holding their middle; nodes keep their OSM ids
use = {}
for w in graph_ways:
    for i, nid in enumerate(w['ids']):
        use[nid] = use.get(nid, 0) + (2 if i in (0, len(w['ids']) - 1) else 1)
n_edges = 0
for w in graph_ways:
    start = 0
    for i in range(1, len(w['ids'])):
        if use[w['ids'][i]] >= 2 or i == len(w['ids']) - 1:
            sp = w['pts'][start:i + 1]
            if len(sp) >= 2 and w['ids'][start] != w['ids'][i]:
                mid = sp[len(sp) // 2]
                if not in_core(mid[0], mid[1], 40):
                    tt = T(tkey(*mid))
                    a, b = w['ids'][start], w['ids'][i]
                    tt['nodes'][str(a)] = [round(sp[0][0], 1), round(sp[0][1], 1)]
                    tt['nodes'][str(b)] = [round(sp[-1][0], 1), round(sp[-1][1], 1)]
                    tt['edges'].append([a, b, 1 if w['oneway'] else 0, w['lanes'], name_idx(tt, w['name']), w['type'], round(w['width'], 1)] + flat(simplify(sp, 0.3)))
                    n_edges += 1
            start = i
print('roads done; graph edges', n_edges)

# ---------------------------------------------------------------- buildings: OSM first, Microsoft footprints where OSM has none
KINDS = {'house': 0, 'detached': 0, 'semidetached_house': 0, 'bungalow': 0, 'terrace': 0, 'residential': 1, 'apartments': 1, 'hotel': 1,
         'retail': 2, 'commercial': 2, 'office': 2, 'supermarket': 2, 'industrial': 2, 'warehouse': 2, 'school': 2, 'church': 2, 'university': 2,
         'roof': 3, 'carport': 3, 'garage': 4, 'garages': 4, 'shed': 4}
def default_h(kind, rnd):
    return {'house': 5.5, 'detached': 5.5, 'semidetached_house': 6, 'residential': 7, 'apartments': 14, 'hotel': 22, 'retail': 6, 'commercial': 9,
            'industrial': 8, 'warehouse': 8, 'roof': 3.2, 'garage': 3, 'garages': 3, 'shed': 2.8, 'carport': 2.6, 'school': 7, 'church': 9, 'office': 12}.get(kind, 6) * (0.85 + rnd.random() * 0.35)
rnd = random.Random(11)
# petrol stations get a modelled forecourt: drop detected canopies and roof structures on top of them
FUEL_PTS = [epos(e) for e in els if e.get('tags', {}).get('amenity') == 'fuel']
FUEL_PTS = [p for p in FUEL_PTS if p]
def near_fuel(x, z, r=18): return any(abs(x - fx) < r and abs(z - fz) < r for fx, fz in FUEL_PTS)
osm_polys = []
BG = 50.0
bgrid = {}
def add_tile_building(pts, h, mh, kind, name=None):
    if area(pts) < 0: pts = pts[::-1]
    pts = simplify(pts + [pts[0]], 0.3)[:-1]
    if len(pts) < 3 or abs(area(pts)) < 6: return
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    if in_core(cx, cz): return
    tt = T(tkey(cx, cz))
    if name: tt['bnames'][str(len(tt['buildings']))] = name
    tt['buildings'].append([round(h, 1), round(mh, 1), kind] + flat(pts))
for e in els:
    t = e.get('tags', {}); b = t.get('building')
    if not b: continue
    if e['type'] == 'way': rings = [ring_clean(geom(e))]
    elif e['type'] == 'relation': rings = join_rings([[proj(q['lat'], q['lon']) for q in m.get('geometry', []) if q] for m in e.get('members', []) if m.get('role') == 'outer'])
    else: continue
    for pts in rings:
        if len(pts) < 3: continue
        h = 0
        try: h = float(str(t.get('height', '0')).split()[0] or 0)
        except ValueError: h = 0
        lv = t.get('building:levels')
        if not h and lv:
            try: h = float(lv.split(';')[0]) * 3.2 + 1
            except ValueError: h = 0
        if not h: h = default_h(b, rnd)
        mh = max(0, h - 0.4) if b == 'roof' else 0
        if b in ('roof', 'canopy') and near_fuel(sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts), 25): continue
        kind = KINDS.get(b, 1 if h > 12 else 2 if h > 7 else 0 if b == 'yes' and abs(area(pts)) < 350 else 2)
        add_tile_building(pts, h, mh, kind, t.get('name'))
        osm_polys.append(pts)
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        for gx in range(int(min(xs) // BG), int(max(xs) // BG) + 1):
            for gz in range(int(min(zs) // BG), int(max(zs) // BG) + 1):
                bgrid.setdefault((gx, gz), []).append(len(osm_polys) - 1)
ms = json.load(open(os.path.join(ROOT, 'data', 'region', 'ms_buildings.json')))
added = 0
for rec in ms:
    h = rec[0]; f = rec[1:]; pts = [(f[i], f[i + 1]) for i in range(0, len(f), 2)]
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    if in_core(cx, cz): continue
    if any(pip((cx, cz), osm_polys[k]) for k in bgrid.get((int(cx // BG), int(cz // BG)), ())): continue
    if near_fuel(cx, cz): continue
    a = abs(area(pts))
    if h <= 0: h = 4.0 if a < 300 else 7.0
    h = max(2.6, h)
    kind = 0 if a < 420 and h < 9 else 4 if a < 30 else 2 if h < 12 else 1
    add_tile_building(pts, h + (0.6 if kind == 0 else 0), 0, kind)
    added += 1
print('osm buildings', len(osm_polys), 'microsoft footprints added', added)

# ---------------------------------------------------------------- land use, parks, beaches and water
def area_kind(t):
    if t.get('natural') == 'beach': return 'beach'
    if t.get('natural') == 'water' or t.get('water') or t.get('waterway') == 'riverbank': return 'water'
    if t.get('leisure') == 'swimming_pool': return 'pool'
    if t.get('leisure') in ('park', 'garden', 'playground', 'nature_reserve', 'golf_course', 'dog_park'): return 'park'
    if t.get('leisure') in ('pitch', 'sports_centre', 'stadium', 'track'): return 'pitch'
    if t.get('landuse') in ('grass', 'greenfield', 'recreation_ground', 'village_green', 'meadow', 'cemetery') or t.get('natural') in ('grassland',): return 'grass'
    if t.get('natural') in ('scrub', 'heath', 'wetland'): return 'scrub'
    if t.get('natural') == 'wood' or t.get('landuse') == 'forest': return 'wood'
    if t.get('amenity') == 'parking': return 'parking'
    if t.get('landuse') == 'residential': return 'residential'
    if t.get('landuse') in ('retail', 'commercial', 'industrial'): return 'commercial'
    if t.get('landuse') in ('construction', 'brownfield'): return 'construction'
    if t.get('man_made') in ('pier', 'breakwater', 'groyne'): return 'pier'
    return None
polys = []  # (kind, [rings])
for e in els:
    t = e.get('tags', {}); k = area_kind(t)
    if not k: continue
    if e['type'] == 'way':
        pts = geom(e)
        if len(pts) < 3 or pts[0] != pts[-1]: continue
        rings = [ring_clean(pts)]
    elif e['type'] == 'relation':
        rings = join_rings([[proj(q['lat'], q['lon']) for q in m.get('geometry', []) if q] for m in e.get('members', []) if m.get('type') == 'way'])
    else: continue
    rings = [simplify(r + [r[0]], 0.5)[:-1] for r in rings if len(r) > 2]
    if rings: polys.append((k, rings))
water_polys = [p for p in ocean_polys] + [r for r in ocean_rings]
all_tiles = [(i, j) for i in range(int(math.floor(RX0 / TILE)), int(math.floor(RX1 / TILE)) + 1) for j in range(int(math.floor(RZ0 / TILE)), int(math.floor(RZ1 / TILE)) + 1)]
poly_bbox = [(k, rings, min(p[0] for r in rings for p in r), min(p[1] for r in rings for p in r), max(p[0] for r in rings for p in r), max(p[1] for r in rings for p in r)) for k, rings in polys]
ocean_bbox = [(r, min(p[0] for p in r), min(p[1] for p in r), max(p[0] for p in r), max(p[1] for p in r)) for r in water_polys]
for (ti, tj) in all_tiles:
    x0, z0 = ti * TILE - 2, tj * TILE - 2; x1, z1 = x0 + TILE + 4, z0 + TILE + 4
    for k, rings, a0, b0, a1, b1 in poly_bbox:
        if a1 < x0 or a0 > x1 or b1 < z0 or b0 > z1: continue
        cl = [clip_polygon(r, x0, z0, x1, z1) for r in rings]
        cl = [flat(c) for c in cl if len(c) > 2]
        if cl: T((ti, tj))['areas'].setdefault(k, []).append(cl)
    for r, a0, b0, a1, b1 in ocean_bbox:
        if a1 < x0 or a0 > x1 or b1 < z0 or b0 > z1: continue
        c = clip_polygon(r, x0, z0, x1, z1)
        if len(c) > 2: T((ti, tj))['water'].append(flat(simplify(c + [c[0]], 0.6)[:-1]))

# ---------------------------------------------------------------- street shops, petrol stations, suburbs, trees, lights
CATS = {'food': 0, 'cafe': 1, 'night': 2, 'shop': 3, 'hotel': 4, 'fun': 5, 'clothes': 6, 'service': 7, 'bank': 8, 'fuel': 9}
def cat_of(t):
    a, s, tr, l = t.get('amenity'), t.get('shop'), t.get('tourism'), t.get('leisure')
    if a == 'fuel': return 'fuel'
    if a == 'bank': return 'bank'
    if s in ('clothes', 'shoes', 'boutique', 'department_store', 'sports', 'surf', 'swimwear', 'fashion_accessories'): return 'clothes'
    if a in ('restaurant', 'fast_food', 'ice_cream', 'food_court'): return 'food'
    if a == 'cafe': return 'cafe'
    if a in ('bar', 'pub', 'nightclub', 'biergarten'): return 'night'
    if tr in ('hotel', 'motel', 'hostel', 'apartment', 'guest_house'): return 'hotel'
    if tr in ('attraction', 'museum', 'theme_park') or l in ('amusement_arcade', 'escape_game', 'bowling_alley') or a in ('cinema', 'theatre'): return 'fun'
    if s: return 'shop'
    if a in ('pharmacy', 'post_office', 'police', 'clinic', 'doctors', 'dentist', 'car_rental', 'car_wash', 'hospital'): return 'service'
    return None
BANK_NAMES = {}
suburbs, landmarks = [], []
seen_poi = set()
for e in els:
    t = e.get('tags', {}); p = epos(e)
    if not p: continue
    if e['type'] == 'node' and t.get('place') in ('suburb', 'neighbourhood', 'town', 'city', 'quarter') and t.get('name'):
        suburbs.append([round(p[0]), round(p[1]), t['name'], t['place']])
        continue
    if in_core(p[0], p[1]): continue
    if e['type'] == 'node' and t.get('natural') == 'tree':
        T(tkey(*p))['trees'].append([round(p[0], 1), round(p[1], 1), 0 if t.get('leaf_type') == 'broadleaved' else 1]); continue
    if e['type'] == 'node' and t.get('highway') == 'traffic_signals':
        T(tkey(*p))['signals'].append([round(p[0], 1), round(p[1], 1)]); continue
    c = cat_of(t)
    if not c: continue
    name = t.get('name') or t.get('brand') or ({'fuel': 'Petrol station'}.get(c))
    if not name: continue
    key = (name, round(p[0] / 50), round(p[1] / 50))
    if key in seen_poi: continue
    seen_poi.add(key)
    sid = 'osm-%s-%s' % (e['type'], e['id'])
    if c == 'bank': name = 'Gold Coast Savings Bank'  # banks appear under a made-up name (they can be robbed)
    tt = T(tkey(*p))
    if c == 'fuel':
        ring = flat(ring_clean(geom(e))) if e['type'] == 'way' else None
        tt['fuel'].append([round(p[0], 1), round(p[1], 1), name, t.get('brand') or name, sid, ring])
    else:
        tt['pois'].append([round(p[0], 1), round(p[1], 1), CATS[c], name, sid])
    if t.get('shop') in ('mall', 'department_store') or t.get('tourism') in ('theme_park', 'attraction') or (e['type'] == 'way' and t.get('building') and t.get('name') and abs(area(geom(e))) > 6000):
        landmarks.append([round(p[0]), round(p[1]), name])
for e in els:  # big named buildings and centres as map landmarks
    t = e.get('tags', {})
    if e['type'] == 'way' and t.get('name') and (t.get('shop') == 'mall' or t.get('leisure') == 'stadium' or t.get('amenity') in ('university', 'hospital')):
        p = epos(e)
        if p and not in_core(*p): landmarks.append([round(p[0]), round(p[1]), t['name']])

# procedural yard and street trees around houses (a leafy suburb), kept off roads and buildings
SG = 25.0
sgrid = {}
for s in road_segs:
    for gx in range(int(min(s[0], s[2]) // SG), int(max(s[0], s[2]) // SG) + 1):
        for gz in range(int(min(s[1], s[3]) // SG), int(max(s[1], s[3]) // SG) + 1):
            sgrid.setdefault((gx, gz), []).append(s)
def near_road(x, z):
    for s in sgrid.get((int(x // SG), int(z // SG)), ()):
        ax, az, bx, bz, w = s; ex, ez = bx - ax, bz - az; L2 = ex * ex + ez * ez or 1
        t = max(0, min(1, ((x - ax) * ex + (z - az) * ez) / L2))
        if math.hypot(x - ax - ex * t, z - az - ez * t) < w / 2 + 2.5: return True
    return False
def in_ocean(x, z):
    c = False
    for r, a0, b0, a1, b1 in ocean_bbox:
        if a0 <= x <= a1 and b0 <= z <= b1 and pip((x, z), r): c = not c
    return c
for (ti, tj), tt in tiles.items():
    houses = [b for b in tt['buildings'] if b[2] == 0]
    if not houses: continue
    tg = {}
    for b in tt['buildings']:
        f = b[3:]; xs = f[0::2]; zs = f[1::2]
        for gx in range(int(min(xs) // 10), int(max(xs) // 10) + 1):
            for gz in range(int(min(zs) // 10), int(max(zs) // 10) + 1): tg[(gx, gz)] = True
    want = min(700, len(houses) // 2)
    r2 = random.Random(ti * 1000 + tj)
    for _ in range(want * 4):
        if len(tt['trees']) >= want + 200: break
        b = houses[int(r2.random() * len(houses))]; f = b[3:]
        cx = sum(f[0::2]) / (len(f) / 2); cz = sum(f[1::2]) / (len(f) / 2)
        a = r2.random() * math.tau; d = 7 + r2.random() * 8
        x, z = cx + math.cos(a) * d, cz + math.sin(a) * d
        if tg.get((int(x // 10), int(z // 10))) or near_road(x, z) or in_core(x, z): continue
        tt['trees'].append([round(x, 1), round(z, 1), 1 if r2.random() < 0.45 else 0])
# street lights along the bigger roads
for (ti, tj), tt in tiles.items():
    for r in tt['roads']:
        if r[0] not in (0, 1, 2, 3, 14): continue
        p = r[4:]; acc = 0; nxt = 15
        for i in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[i], p[i + 1], p[i + 2], p[i + 3]; L = math.hypot(bx - ax, bz - az) or 1
            while nxt < acc + L:
                t = (nxt - acc) / L; side = 1 if int(nxt / 40) % 2 else -1; off = r[1] / 2 + 1.0
                x = ax + (bx - ax) * t + (bz - az) / L * off * side; z = az + (bz - az) * t - (bx - ax) / L * off * side
                tt['lamps'].append([round(x, 1), round(z, 1), round(math.atan2(-(bz - az) / L * side, (bx - ax) / L * side), 2)])
                nxt += 40
            acc += L

# ---------------------------------------------------------------- write
out_dir = os.path.join(ROOT, 'dist', 'tiles')
os.makedirs(out_dir, exist_ok=True)
for f in glob.glob(os.path.join(out_dir, 't_*.json')): os.remove(f)
index, total = [], 0
for (ti, tj), tt in sorted(tiles.items()):
    if not (tt['roads'] or tt['buildings'] or tt['water'] or tt['areas']): continue
    tt.update(i=ti, j=tj)
    path = os.path.join(out_dir, 't_%d_%d.json' % (ti, tj))
    json.dump(tt, open(path, 'w'), separators=(',', ':'))
    size = os.path.getsize(path); total += size
    index.append([ti, tj, len(tt['buildings']), size])
# overview for the region map and minimap: big roads, water and suburb names
ov_roads = []
for (ti, tj), tt in tiles.items():
    for r in tt['roads']:
        if r[0] in (0, 1, 2, 3, 14, 4, 11):
            ov_roads.append([r[0]] + flat(simplify([(r[i], r[i + 1]) for i in range(4, len(r), 2)], 3)))
ov_water = [flat(simplify(r + [r[0]], 6)[:-1]) for r in water_polys]
for k, rings in polys:
    if k == 'water' and abs(area(rings[0])) > 4000:
        ov_water.append(flat(simplify(rings[0] + [rings[0][0]], 4)[:-1]))
# open-ocean coastline (for the surf), outside the Surfers core which has its own
ov_coast = []
for ln in coast:
    run = []
    for q in ln:
        if in_core(q[0], q[1], 30) or not (RX0 <= q[0] <= RX1 and RZ0 <= q[1] <= RZ1):
            if len(run) > 1: ov_coast.append(flat(simplify(run, 1.5)))
            run = []
        else: run.append(q)
    if len(run) > 1: ov_coast.append(flat(simplify(run, 1.5)))
region = dict(tile=TILE, bounds=[RX0, RZ0, RX1, RZ1], core=CORE, tiles=index, roads=ov_roads, water=ov_water, coast=ov_coast,
              suburbs=suburbs, landmarks=landmarks, roadTypes=ROAD_TYPES)
json.dump(region, open(os.path.join(out_dir, 'region.json'), 'w'), separators=(',', ':'))
print('tiles', len(index), 'total', total // 1024, 'KB; region.json', os.path.getsize(os.path.join(out_dir, 'region.json')) // 1024, 'KB')
print('largest tiles', sorted(index, key=lambda q: -q[3])[:5])
print('suburbs', sorted(set(s[2] for s in suburbs))[:60])
