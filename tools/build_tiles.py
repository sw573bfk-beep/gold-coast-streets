"""Build the streamed world around Surfers Paradise: 1 km tiles from Southport to Burleigh Heads,
inland to Robina, Carrara and Benowa.

Inputs: data/region/osm_*.json (OpenStreetMap via Overpass), data/region/ms_buildings.json (Microsoft footprints),
        data/map.json (the hand-detailed Surfers Paradise core, which tiles leave alone).
Outputs: dist/tiles/t_<i>_<j>.json (one per non-empty tile), dist/tiles/region.json (overview for maps and the index).
Run: python3 tools/build_tiles.py
"""
import array, base64, glob, json, math, os, random, re, sys

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
drive_segs = []  # drivable roads only: front doors face these
BRIDGES = []  # (pts, width): decks keep a level line between their ends instead of dipping to the ground below
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
        if hw in DRIVABLE or is_link: drive_segs.append((pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width))
    if bridge and hw in DRIVABLE | {'service', 'motorway'}: BRIDGES.append((pts, width))
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
                # inside the Surfers core the hand-built network drives the traffic; these copies only join up the GPS
                tt = T(tkey(*mid)); key = 'gpsedges' if in_core(mid[0], mid[1], 40) else 'edges'
                a, b = w['ids'][start], w['ids'][i]
                tt['nodes'][str(a)] = [round(sp[0][0], 1), round(sp[0][1], 1)]
                tt['nodes'][str(b)] = [round(sp[-1][0], 1), round(sp[-1][1], 1)]
                tt.setdefault(key, []).append([a, b, 1 if w['oneway'] else 0, w['lanes'], name_idx(tt, w['name']), w['type'], round(w['width'], 1)] + flat(simplify(sp, 0.3)))
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
    if a in ('bar', 'pub', 'nightclub', 'biergarten', 'stripclub'): return 'night'
    if a == 'casino': return 'fun'
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
        # the level (inside shopping centres) and the OSM shop type (to tell anchor stores from small shops)
        try: lv = int(float(str(t.get('level', '')).split(';')[0]))
        except ValueError: lv = None
        tt['pois'].append([round(p[0], 1), round(p[1], 1), CATS[c], name, sid, lv, t.get('shop') or t.get('amenity') or ''])
    if t.get('shop') == 'mall' or t.get('tourism') in ('theme_park', 'attraction'):
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
# ---------------------------------------------------------------- ground height, roof colours, pools and trees (Queensland Government open data)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aerial import Raster
HAVE_DEM = os.path.exists(os.path.join(ROOT, 'data', 'region', 'dem.json'))
HAVE_AIR = os.path.exists(os.path.join(ROOT, 'data', 'region', 'air.json'))
DEM = Raster('dem') if HAVE_DEM else None
AIR = Raster('air') if HAVE_AIR else None
def unproj(x, z): return LAT0 - z / KZ, LON0 + x / KX
GROUND_BASE = 3.0   # metres above sea level that game height 0 stands for (the flat Surfers core sits around 4-6 m)
HSTEP, HN = 10.0, 101  # height grid: one sample every 10 m, 101 x 101 per tile (shared edges)
def core_fade(x, z):
    dx = max(CORE[0] - x, 0, x - CORE[2]); dz = max(CORE[1] - z, 0, z - CORE[3]); d = math.hypot(dx, dz)
    t = min(1.0, d / 250.0); return t * t * (3 - 2 * t)
# bridge decks: a straight line between the ground at each end, so roads stay level over water and other roads
BG = 50.0
bgrid = {}
for pts, w in BRIDGES:
    if not DEM: break
    ha = DEM.value(*unproj(*pts[0])) or 0; hb = DEM.value(*unproj(*pts[-1])) or 0
    L = [0.0]
    for i in range(len(pts) - 1): L.append(L[-1] + math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
    tot = L[-1] or 1
    for i in range(len(pts) - 1):
        seg = (pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w / 2 + 3, ha + (hb - ha) * L[i] / tot, ha + (hb - ha) * L[i + 1] / tot)
        for gx in range(int(min(seg[0], seg[2]) // BG) - 1, int(max(seg[0], seg[2]) // BG) + 2):
            for gz in range(int(min(seg[1], seg[3]) // BG) - 1, int(max(seg[1], seg[3]) // BG) + 2):
                bgrid.setdefault((gx, gz), []).append(seg)
def ground_raw(x, z):
    """Game height (metres) at a point: LiDAR bare earth, bridges levelled, faded to 0 at the Surfers core."""
    h = None
    for ax, az, bx, bz, r, h0, h1 in bgrid.get((int(x // BG), int(z // BG)), ()):
        ex, ez = bx - ax, bz - az; L2 = ex * ex + ez * ez or 1
        t = max(0, min(1, ((x - ax) * ex + (z - az) * ez) / L2))
        if math.hypot(x - ax - ex * t, z - az - ez * t) < r: h = h0 + (h1 - h0) * t; break
    if h is None: h = DEM.value(*unproj(x, z))
    if h is None: return 0.0
    return max(0.0, h - GROUND_BASE) * core_fade(x, z)
def tile_heights(ti, tj):
    """101 x 101 heights for a tile, smoothed 3 x 3 over a one-sample apron so neighbouring tiles agree at the seam."""
    x0, z0 = ti * TILE, tj * TILE
    raw = [[ground_raw(x0 + (i - 1) * HSTEP, z0 + (j - 1) * HSTEP) for i in range(HN + 2)] for j in range(HN + 2)]
    out = []
    for j in range(1, HN + 1):
        for i in range(1, HN + 1):
            out.append(sum(raw[j + dj][i + di] for dj in (-1, 0, 1) for di in (-1, 0, 1)) / 9)
    return out

# roof colours: the median photo colour inside each footprint (leaves and shadow-black left out)
def roof_colour(f):
    xs = f[0::2]; zs = f[1::2]; n = len(xs); poly = list(zip(xs, zs))
    cx, cz = sum(xs) / n, sum(zs) / n
    a = abs(area(poly)); step = max(1.5, math.sqrt(a / 60))
    got = []
    x = min(xs) + step / 2
    while x < max(xs):
        z = min(zs) + step / 2
        while z < max(zs):
            if pip((x, z), poly):
                qx, qz = cx + (x - cx) * 0.8, cz + (z - cz) * 0.8
                c = AIR.rgb(*unproj(qx, qz))
                if c: got.append(c)
            z += step
        x += step
    if not got:
        c = AIR.rgb(*unproj(cx, cz)); got = [c] if c else []
    if not got: return None
    keep = [c for c in got if not (c[1] > c[0] + 8 and c[1] > c[2] + 4) and sum(c) > 60] or got
    med = lambda k: sorted(c[k] for c in keep)[len(keep) // 2]
    r, g, b = med(0), med(1), med(2)
    # aerial photos look through haze: restore some saturation and contrast so roofs read as they do from the street
    l = 0.3 * r + 0.59 * g + 0.11 * b
    fix = lambda v: max(0, min(255, round((l + (v - l) * 1.45 - 128) * 1.08 + 128)))
    return (fix(r), fix(g), fix(b))
WALLS_WARM = [(0xd8, 0xc3, 0xa5), (0xe8, 0xdc, 0xc6), (0xc9, 0x8a, 0x63), (0xb7, 0x70, 0x4f), (0xef, 0xe7, 0xda), (0xd9, 0xb8, 0x8f)]
WALLS_COOL = [(0xf4, 0xf1, 0xea), (0xe6, 0xe6, 0xe2), (0xd9, 0xd3, 0xc7), (0xc8, 0xc8, 0xc4), (0xf0, 0xec, 0xe0), (0x9a, 0x9a, 0x96)]
def wall_for(roof, rnd):
    """Walls can't be seen from above, so pick a believable match for the real roof."""
    r, g, b = roof; luma = 0.3 * r + 0.59 * g + 0.11 * b
    if r > g + 22 and r > b + 30: pal = WALLS_WARM
    elif luma < 95: pal = WALLS_COOL[:4]
    else: pal = WALLS_COOL if rnd.random() < 0.6 else WALLS_WARM[:2]
    return pal[int(rnd.random() * len(pal))]
def hexi(c): return (int(c[0]) << 16) | (int(c[1]) << 8) | int(c[2])

# front and back doors: the front faces the nearest drivable road, the back is the wall most opposite it
DG = 40.0
dgrid = {}
for sg in drive_segs:
    for gx in range(int(min(sg[0], sg[2]) // DG), int(max(sg[0], sg[2]) // DG) + 1):
        for gz in range(int(min(sg[1], sg[3]) // DG), int(max(sg[1], sg[3]) // DG) + 1):
            dgrid.setdefault((gx, gz), []).append(sg)
def nearest_drive(x, z):
    best, bp = 1e9, None
    for gx in range(int(x // DG) - 2, int(x // DG) + 3):
        for gz in range(int(z // DG) - 2, int(z // DG) + 3):
            for ax, az, bx, bz, w in dgrid.get((gx, gz), ()):
                ex, ez = bx - ax, bz - az; L2 = ex * ex + ez * ez or 1
                t = max(0, min(1, ((x - ax) * ex + (z - az) * ez) / L2)); px, pz = ax + ex * t, az + ez * t
                d = math.hypot(x - px, z - pz)
                if d < best: best, bp = d, (px, pz)
    return bp
def house_doors(f):
    xs = f[0::2]; zs = f[1::2]; n = len(xs); poly = list(zip(xs, zs))
    cx, cz = sum(xs) / n, sum(zs) / n
    rp = nearest_drive(cx, cz)
    if not rp: return [-1, -1]
    dx, dz = rp[0] - cx, rp[1] - cz; dl = math.hypot(dx, dz) or 1; dx /= dl; dz /= dl
    best, front, worst, back = -2, -1, 2, -1
    for q in range(n):
        ax, az = poly[q]; bx, bz = poly[(q + 1) % n]; L = math.hypot(bx - ax, bz - az)
        if L < 2.4: continue
        nx, nz = (bz - az) / L, -(bx - ax) / L
        if pip(((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3), poly): nx, nz = -nx, -nz
        d = nx * dx + nz * dz
        if d > best: best, front = d, q
        if d < worst: worst, back = d, q
    return [front, back if back != front else -1]

def convex_hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3: return pts
    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0: h.pop()
            h.append(p)
        return h
    lo, hi = half(pts), half(reversed(pts))
    return lo[:-1] + hi[:-1]
def in_water_area(x, z, tt):
    if in_ocean(x, z): return True
    for poly in tt['areas'].get('water', []):
        ring = poly[0] if poly and isinstance(poly[0], list) else poly  # outer ring of a polygon with holes
        if pip((x, z), list(zip(ring[0::2], ring[1::2]))): return True
    return False
def scan_photo(ti, tj, tt):
    """Pools (turquoise blobs) and tree crowns (dark green blobs) from the photo, at its 2 m pixels."""
    x0, z0, P = ti * TILE, tj * TILE, 2.0
    N = int(TILE / P)
    occ = bytearray(N * N)  # building pixels
    for b in tt['buildings']:
        f = b[3:]; xs = f[0::2]; zs = f[1::2]; poly = list(zip(xs, zs))
        for py in range(max(0, int((min(zs) - z0) / P)), min(N, int((max(zs) - z0) / P) + 1)):
            for px in range(max(0, int((min(xs) - x0) / P)), min(N, int((max(xs) - x0) / P) + 1)):
                if pip((x0 + (px + 0.5) * P, z0 + (py + 0.5) * P), poly): occ[py * N + px] = 1
    cls = bytearray(N * N)  # 1 pool, 2 canopy
    S = AIR.size
    cols = [int(round(AIR.px(LAT0, LON0 + (x0 + (px + 0.5) * P) / KX)[0])) for px in range(N)]  # photo column for each tile pixel
    for py in range(N):
        yy = int(round(AIR.px(LAT0 - (z0 + (py + 0.5) * P) / KZ, LON0)[1]))
        if yy < 0 or yy >= AIR.h: continue
        row = py * N
        for px in range(N):
            if occ[row + px]: continue
            xx = cols[px]
            if xx < 0 or xx >= AIR.w: continue
            ch = AIR.chunks.get((yy // S, xx // S))
            if not ch: continue
            cw, chh, data = ch; o = (yy % S) * cw + (xx % S); plane = cw * chh
            r = data[o]; g = data[o + plane]; b = data[o + 2 * plane]
            if r == 0 and g == 0 and b == 0: continue
            if b > 140 and g > 120 and r < 135 and b - r > 55 and g - r > 30: cls[row + px] = 1
            elif g > r + 6 and g >= b and r + g + b < 260: cls[row + px] = 2
    seen = bytearray(N * N); pools, crowns = [], []
    for start in range(N * N):
        k = cls[start]
        if not k or seen[start]: continue
        stack, comp = [start], []; seen[start] = 1
        while stack:
            v = stack.pop(); comp.append(v); vy, vx = divmod(v, N)
            for w in (v - 1 if vx else -1, v + 1 if vx < N - 1 else -1, v - N, v + N):
                if 0 <= w < N * N and not seen[w] and cls[w] == k: seen[w] = 1; stack.append(w)
        if k == 1:
            if 3 <= len(comp) <= 150:
                pts = [(x0 + (v % N + 0.5) * P, z0 + (v // N + 0.5) * P) for v in comp]
                mx = sum(p[0] for p in pts) / len(pts); mz = sum(p[1] for p in pts) / len(pts)
                if in_core(mx, mz) or in_water_area(mx, mz, tt): continue
                corners = [(px_ + ox, pz_ + oz) for px_, pz_ in pts for ox in (-1, 1) for oz in (-1, 1)]
                pools.append(flat(convex_hull([(round(a, 1), round(b, 1)) for a, b in corners])))
        elif len(comp) >= 4:
            if len(comp) <= 30:
                pts = [(x0 + (v % N + 0.5) * P, z0 + (v // N + 0.5) * P) for v in comp]
                crowns.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), min(5.5, math.sqrt(len(comp) * 4 / math.pi))))
            else:  # a stand of trees: one every ~8 m across the canopy
                for v in comp:
                    vy, vx = divmod(v, N)
                    if vx % 4 == (vy // 4) % 2 * 2 and vy % 4 == 0:
                        crowns.append((x0 + (vx + 0.5) * P, z0 + (vy + 0.5) * P, 3.6))
    return pools, crowns

# ---------------------------------------------------------------- school, hospital and shopping-centre grounds: their buildings aren't houses
GROUNDS = []  # (kind, name, ring)
for e in els:
    t = e.get('tags', {})
    k = 'school' if t.get('amenity') in ('school', 'college', 'university', 'kindergarten') else 'hospital' if t.get('amenity') == 'hospital' else 'mall' if t.get('shop') == 'mall' else None
    if not k or e['type'] != 'way': continue
    ring = ring_clean(geom(e))
    if len(ring) >= 3: GROUNDS.append((k, t.get('name'), ring, min(q[0] for q in ring), min(q[1] for q in ring), max(q[0] for q in ring), max(q[1] for q in ring)))
n_inst = 0
for (ti, tj), tt in tiles.items():
    for b in tt['buildings']:
        if b[2] not in (0, 2): continue
        f = b[3:]; cx = sum(f[0::2]) / (len(f) / 2); cz = sum(f[1::2]) / (len(f) / 2)
        for k, nm, ring, x0, z0, x1, z1 in GROUNDS:
            if b[2] == 2 and k == 'mall': continue
            if x0 <= cx <= x1 and z0 <= cz <= z1 and pip((cx, cz), ring): b[2] = {'school': 6, 'hospital': 7}.get(k, 2); n_inst += 1; break  # 6 school, 7 hospital
# a name sign at each school's street entrance (the grounds' edge nearest a drivable road)
n_sign = 0
for k, nm, ring, x0, z0, x1, z1 in GROUNDS:
    if k != 'school' or not nm: continue
    cx, cz = sum(q[0] for q in ring) / len(ring), sum(q[1] for q in ring) / len(ring)
    rp = nearest_drive(cx, cz)
    if not rp or in_core(*rp): continue
    best, bd = None, 1e9
    for i in range(len(ring)):
        a, b2 = ring[i], ring[(i + 1) % len(ring)]; ex, ez = b2[0] - a[0], b2[1] - a[1]; L2 = ex * ex + ez * ez or 1
        tt_ = max(0, min(1, ((rp[0] - a[0]) * ex + (rp[1] - a[1]) * ez) / L2)); px, pz = a[0] + ex * tt_, a[1] + ez * tt_
        d = math.hypot(px - rp[0], pz - rp[1])
        if d < bd: bd, best = d, (px, pz)
    if not best or bd > 60: continue
    dx, dz = cx - best[0], cz - best[1]; dl = math.hypot(dx, dz) or 1
    sx, sz = best[0] + dx / dl * 3, best[1] + dz / dl * 3
    T(tkey(sx, sz)).setdefault('signs', []).append([round(sx, 1), round(sz, 1), round(math.atan2(rp[0] - sx, rp[1] - sz), 2), nm]); n_sign += 1
print('buildings in school/hospital/centre grounds made non-residential', n_inst, '| school entrance signs', n_sign)
n_pool = n_tree = n_col = 0
for (ti, tj), tt in tiles.items():
    tt['bdoor'] = [house_doors(b[3:]) if b[2] == 0 else 0 for b in tt['buildings']]
if HAVE_DEM or HAVE_AIR:
    for (ti, tj), tt in tiles.items():
        if HAVE_DEM:
            hs = tile_heights(ti, tj)
            if max(hs) > 0.3:
                tt['hgt'] = base64.b64encode(array.array('h', [int(round(v * 10)) for v in hs]).tobytes()).decode()
        if HAVE_AIR and AIR.complete():
            rnd = random.Random(ti * 7919 + tj)
            tt['bcol'] = []
            for b in tt['buildings']:
                rc = roof_colour(b[3:])
                if rc: n_col += 1
                tt['bcol'].append([hexi(rc), hexi(wall_for(rc, rnd))] if rc else 0)
            pools, crowns = scan_photo(ti, tj, tt)
            if pools: tt['areas'].setdefault('pool', []).extend(pools); n_pool += len(pools)
            mapped = [(t[0], t[1]) for t in tt['trees']]
            for x, z, r in crowns[:3000]:
                if in_core(x, z) or near_road(x, z) or any(abs(x - a) < 4 and abs(z - b) < 4 for a, b in mapped[:400]): continue
                tt['trees'].append([round(x, 1), round(z, 1), 0, round(r, 1)]); n_tree += 1
            tt['aerial'] = 1
    print('heights from LiDAR' if HAVE_DEM else '', '| roof colours', n_col, 'pools', n_pool, 'photo trees', n_tree)

for (ti, tj), tt in tiles.items():
    houses = [b for b in tt['buildings'] if b[2] == 0]
    if not houses or tt.get('aerial'): continue  # photo trees already placed
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
# ---------------------------------------------------------------- fences, walls, hedges and railings (OpenStreetMap barrier=*), with gate gaps
BARRIER_CLS = {'fence': 0, 'wall': 1, 'city_wall': 1, 'hedge': 2, 'guard_rail': 3, 'handrail': 3, 'cable_barrier': 3, 'jersey_barrier': 3, 'retaining_wall': 4}
BARRIER_H = {0: 1.5, 1: 1.8, 2: 1.4, 3: 0.85, 4: 1.0}
n_bar = n_gate = 0
bar_els = {}
for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'region', 'barriers_*.json'))):
    for e in json.load(open(path))['elements']: bar_els[(e['type'], e['id'])] = e
gates = [proj(e['lat'], e['lon']) + (e['tags'].get('barrier'),) for e in bar_els.values() if e['type'] == 'node']
GG = 20.0
ggrid = {}
for gx_, gz_, kind in gates: ggrid.setdefault((int(gx_ // GG), int(gz_ // GG)), []).append((gx_, gz_, kind))
def gate_at(x, z):
    for gx_, gz_, kind in ggrid.get((int(x // GG), int(z // GG)), ()):
        if abs(gx_ - x) < 0.6 and abs(gz_ - z) < 0.6: return kind
    return None
for e in bar_els.values():
    if e['type'] != 'way': continue
    t = e.get('tags', {}); cls = BARRIER_CLS.get(t.get('barrier'))
    if cls is None: continue
    pts = geom(e)
    if len(pts) < 2: continue
    try: h = float(str(t.get('height', '')).replace('m', '').strip())
    except ValueError: h = BARRIER_H[cls]
    h = max(0.4, min(4.0, h))
    # cut a gap at every mapped gate on the line (vehicle gates wider than pedestrian ones)
    pieces, cur = [], [pts[0]]
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]; g = gate_at(*b)
        if g and g not in ('bollard',):
            w = 3.5 if g in ('lift_gate', 'sliding_gate', 'swing_gate') else 1.2
            L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
            cut = max(0, L - w / 2) / L
            cur.append((a[0] + (b[0] - a[0]) * cut, a[1] + (b[1] - a[1]) * cut)); pieces.append(cur); n_gate += 1
            nxt = pts[i + 1] if i + 1 < len(pts) else None
            if nxt:
                L2 = math.hypot(nxt[0] - b[0], nxt[1] - b[1]) or 1; c2 = min(1, (w / 2) / L2)
                cur = [(b[0] + (nxt[0] - b[0]) * c2, b[1] + (nxt[1] - b[1]) * c2)]
            else: cur = []
        else: cur.append(b)
    if len(cur) > 1: pieces.append(cur)
    for pc in pieces:
        xs = [q[0] for q in pc]; zs = [q[1] for q in pc]
        for ti in range(tkey(min(xs), 0)[0], tkey(max(xs), 0)[0] + 1):
            for tj in range(tkey(0, min(zs))[1], tkey(0, max(zs))[1] + 1):
                x0, z0 = ti * TILE, tj * TILE
                for cpc in clip_polyline(pc, x0, z0, x0 + TILE, z0 + TILE):
                    if len(cpc) < 2 or all(in_core(q[0], q[1]) for q in cpc): continue
                    T((ti, tj)).setdefault('barriers', []).append([cls, round(h, 1)] + flat(cpc)); n_bar += 1
print('barriers', n_bar, 'pieces; gate gaps', n_gate, '; gates and bollards mapped', len(gates))

# ---------------------------------------------------------------- the map search: every named street and place, as [name, kind, x, z]
SEARCH_KINDS = ['street', 'school', 'park', 'beach', 'hospital', 'shopping centre', 'shop', 'suburb', 'hotel', 'petrol', 'attraction', 'sport', 'food', 'service', 'transport']
def search_kind(t):
    a, sh, le, to = t.get('amenity'), t.get('shop'), t.get('leisure'), t.get('tourism')
    if a in ('school', 'kindergarten', 'college', 'university') or t.get('building') == 'school': return 1
    if le in ('park', 'nature_reserve', 'garden', 'playground', 'dog_park') or t.get('boundary') == 'protected_area': return 2
    if t.get('natural') == 'beach': return 3
    if a in ('hospital', 'clinic'): return 4
    if sh == 'mall': return 5
    if to in ('hotel', 'motel', 'hostel', 'apartment', 'guest_house'): return 8
    if a == 'fuel': return 9
    if to in ('attraction', 'museum', 'theme_park', 'zoo', 'viewpoint', 'gallery') or t.get('historic'): return 10
    if le in ('stadium', 'sports_centre', 'golf_course', 'pitch', 'swimming_pool', 'fitness_centre', 'marina') : return 11
    if a in ('restaurant', 'cafe', 'fast_food', 'pub', 'bar', 'ice_cream', 'food_court', 'nightclub'): return 12
    if a in ('bank', 'pharmacy', 'police', 'fire_station', 'library', 'post_office', 'place_of_worship', 'doctors', 'dentist', 'community_centre', 'townhall', 'courthouse', 'cinema', 'theatre'): return 13
    if t.get('railway') in ('station', 'tram_stop') or t.get('public_transport') == 'station' or a == 'bus_station': return 14
    if sh: return 6
    return None
search, seen_s = [], {}
def add_search(name, kind, x, z, spread):
    if not (RX0 <= x <= RX1 and RZ0 <= z <= RZ1): return
    key = (name.lower(), kind)
    for (px, pz) in seen_s.get(key, ()):
        if abs(px - x) < spread and abs(pz - z) < spread: return
    seen_s.setdefault(key, []).append((x, z)); search.append([name, kind, round(x), round(z)])
for e in els:
    t = e.get('tags', {}); nm = t.get('name')
    if not nm: continue
    if e['type'] == 'way' and t.get('highway') and t.get('highway') not in ('footway', 'path', 'steps', 'cycleway', 'bus_stop', 'platform'):
        g = geom(e)
        if g: m = g[len(g) // 2]; add_search(nm, 0, m[0], m[1], 700)  # one entry per stretch of street
        continue
    if t.get('place') in ('suburb', 'town', 'neighbourhood', 'quarter', 'village'):
        p = epos(e)
        if p: add_search(nm, 7, p[0], p[1], 2000)
        continue
    k = search_kind(t)
    if k is None: continue
    p = epos(e)
    if p: add_search(nm, k, p[0], p[1], 150)
print('search entries', len(search), {SEARCH_KINDS[k]: sum(1 for s_ in search if s_[1] == k) for k in range(len(SEARCH_KINDS))})

region = dict(tile=TILE, bounds=[RX0, RZ0, RX1, RZ1], core=CORE, tiles=index, roads=ov_roads, water=ov_water, coast=ov_coast,
              suburbs=suburbs, landmarks=landmarks, roadTypes=ROAD_TYPES, search=search, searchKinds=SEARCH_KINDS)
json.dump(region, open(os.path.join(out_dir, 'region.json'), 'w'), separators=(',', ':'))
print('tiles', len(index), 'total', total // 1024, 'KB; region.json', os.path.getsize(os.path.join(out_dir, 'region.json')) // 1024, 'KB')
print('largest tiles', sorted(index, key=lambda q: -q[3])[:5])
print('suburbs', sorted(set(s[2] for s in suburbs))[:60])
